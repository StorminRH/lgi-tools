import { ESI_COMPATIBILITY_DATE } from '@/config/esi';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import {
  BODY_CACHE_MAX_BYTES,
  resolveScoreboard,
  __resetScoreboardForTests,
  type CachedEtagMeta,
  type EsiReport,
  type EsiScoreboard,
  type PreDispatchState,
} from './scoreboard';

// Wrapper around `fetch` that enforces CCP's ESI limits. Two systems apply
// (verified live 2026-06-11):
//
//  • The legacy error limit — per-IP, ALL routes, fixed 60s window, 100
//    non-2xx/3xx responses, then 420 everywhere and (repeated) a permanent
//    IP ban. Headers: X-ESI-Error-Limit-Remain / -Reset.
//  • The token-bucket rate limit (rolling out per route group) — 2 tokens per
//    2xx, 1 per 3xx (so a 304 costs half a 200), 5 per 4xx, 0 per 5xx, ~15-min
//    floating window. Headers: X-Ratelimit-Group/-Limit/-Remaining/-Used;
//    429 + Retry-After when exhausted. A response carries one header system
//    or the other, never both — so the error-limit mirror can't rely on
//    header echo alone.
//
// Both limits are shared across every serverless instance we run, so the
// budget state lives in a shared Upstash Redis scoreboard (scoreboard.ts,
// Decision Record 11): every esiFetch consults it before dispatch and reports
// every response's headers back to it. This gate is the single door — all ESI
// consumers route through esiFetch (the esi.evetech.net host literal is
// lint-banned outside this slice; build URLs with esiUrl). The gate is
// OAuth-agnostic: headers passed via `init` (e.g. a per-call Authorization
// token) go through untouched.
//
// Posture: fail closed. If the scoreboard is unreachable, non-interactive
// dispatch refuses (callers degrade their own way — market-prices falls back
// to its Fuzzwork mirror) and `interactive: true` callers get a hard-capped
// per-instance trickle. ETags are used aggressively: a stored ETag rides out
// as If-None-Match, and a 304 is re-served from the cached body as a normal
// 200 (cache circumvention is a documented bannable offense; conditional
// requests are the documented good citizenship).
//
// The `budgetExhausted` signal callers thread into telemetry now covers every
// refusal reason (error budget, 420, a 429 Retry-After block, scoreboard
// unreachable, trickle cap) — same flag, same degradation path.

// Refuse to dispatch when the effective error-budget remaining falls below
// this floor. ESI's ceiling is 100 errors per window; refusing at 20 left
// (80% spent) leaves slack for in-flight calls and for the egress-IP sharing
// that makes our mirror an approximation.
export const ESI_BUDGET_FLOOR = 20;

// Why dispatch was refused (or aborted on a 420). One error class for every
// reason: the market-prices bulk path re-throws error types it doesn't
// recognize, so a refusal must always be an EsiBudgetExhaustedError to reach
// the Fuzzwork fallback.
export type EsiBudgetExhaustedReason =
  | 'error_budget'
  | 'esi_420'
  | 'rate_limited'
  | 'scoreboard_unavailable'
  | 'trickle_capped';

// Thrown when the gate refuses to dispatch (or ESI answers 420). Caller
// should stop dispatching ESI calls and degrade.
export class EsiBudgetExhaustedError extends Error {
  constructor(
    public readonly remaining: number,
    public readonly reason: EsiBudgetExhaustedReason = 'error_budget',
  ) {
    super(
      `ESI error budget exhausted (${reason}): ${remaining} remaining (floor ${ESI_BUDGET_FLOOR})`,
    );
    this.name = 'EsiBudgetExhaustedError';
  }
}

// Thrown when ESI returns a 5xx. Caller may retry or degrade. Treated
// as a transient single-call failure, not a global outage — e.g. the
// market-prices bulk path upgrades repeated 5xx to a Fuzzwork-fallback
// escalation.
export class EsiServerError extends Error {
  constructor(public readonly status: number) {
    super(`ESI server error: ${status}`);
    this.name = 'EsiServerError';
  }
}

// Thrown when an ESI response body fails its boundary schema (a shape change
// or an unexpected error body). Callers route it the same way they route an
// HTTP error — a malformed body is no more usable than a 5xx.
export class EsiContractError extends Error {
  constructor() {
    super('ESI response failed boundary validation');
    this.name = 'EsiContractError';
  }
}

// Label-less by design: CCP warns against the `/latest` label (it can shift
// behavior when they bump what it points at), so we drop it and pin the
// contract via the X-Compatibility-Date header instead (src/config/esi.ts).
const ESI_BASE_URL = 'https://esi.evetech.net';

// The only sanctioned way to construct an ESI URL — the host literal is
// lint-banned outside this slice so every consumer arrives here, where
// esiFetch (and the shared budget) is the only dispatch on offer.
export function esiUrl(path: string): string {
  return `${ESI_BASE_URL}${path}`;
}

export interface EsiFetchOptions {
  // User-initiated call: when the scoreboard is unreachable, allow a
  // hard-capped per-instance trickle instead of refusing outright.
  // Non-interactive work (crons, syncs) always fails closed.
  interactive?: boolean;
}

// Per-instance fallback state — NOT budget state (that lives in the
// scoreboard). The circuit-breaker memo keeps a Redis outage from adding a
// timeout to every call; the trickle counter caps what an interactive caller
// can spend while the shared mirror is blind.
const TRICKLE_MAX_PER_MINUTE = 10;
const REDIS_RETRY_AFTER_MS = 5_000;
let redisDownUntil = 0;
let trickleWindowStart = 0;
let trickleCount = 0;

// Test seam: '`unavailable`' simulates an unreachable/unconfigured
// scoreboard; an object replaces the resolved one. Not for runtime callers.
let scoreboardOverride: EsiScoreboard | 'unavailable' | null = null;

export function __setScoreboardForTests(
  sb: EsiScoreboard | 'unavailable' | null,
): void {
  scoreboardOverride = sb;
}

// Reset module-level state between Vitest cases. Not for runtime callers.
export function __resetEsiGateForTests(): void {
  redisDownUntil = 0;
  trickleWindowStart = 0;
  trickleCount = 0;
  scoreboardOverride = null;
  __resetScoreboardForTests();
}

function getScoreboard(): EsiScoreboard | null {
  if (scoreboardOverride === 'unavailable') return null;
  if (scoreboardOverride !== null) return scoreboardOverride;
  return resolveScoreboard();
}

// Conditional requests and body caching apply only to unauthenticated GETs:
// the shared cache must never hold per-character data.
function isEtagEligible(init?: RequestInit): boolean {
  if ((init?.method ?? 'GET').toUpperCase() !== 'GET') return false;
  return !new Headers(init?.headers).has('Authorization');
}

function parseIntHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildHeaders(init?: RequestInit, etag?: string | null): Headers {
  // Identify ourselves on every ESI call. Default (set-if-absent) so a
  // deliberate caller could override, while no call goes out anonymous.
  const headers = new Headers(init?.headers);
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', OUTBOUND_USER_AGENT);
  }
  // Pin the ESI contract date (forced — the app speaks one route and the date
  // is a single reviewed constant; a per-call override would un-pin it).
  headers.set('X-Compatibility-Date', ESI_COMPATIBILITY_DATE);
  if (etag != null) {
    headers.set('If-None-Match', etag);
  }
  return headers;
}

function buildReport(
  url: string,
  res: Response,
  extras: Pick<EsiReport, 'etagToStore' | 'refreshEtag'>,
): EsiReport {
  return {
    url,
    status: res.status,
    errorLimitRemain: parseIntHeader(res.headers, 'X-ESI-Error-Limit-Remain'),
    errorLimitReset: parseIntHeader(res.headers, 'X-ESI-Error-Limit-Reset'),
    rateLimitGroup: res.headers.get('X-Ratelimit-Group'),
    rateLimitLimit: parseIntHeader(res.headers, 'X-Ratelimit-Limit'),
    rateLimitRemaining: parseIntHeader(res.headers, 'X-Ratelimit-Remaining'),
    rateLimitUsed: parseIntHeader(res.headers, 'X-Ratelimit-Used'),
    retryAfter: parseIntHeader(res.headers, 'Retry-After'),
    ...extras,
  };
}

// A failed report must not fail a successful fetch — the next pre-dispatch
// failing is what closes the gate. The memo keeps the outage cheap.
async function safeReport(sb: EsiScoreboard, report: EsiReport): Promise<void> {
  try {
    await sb.report(report);
  } catch (err) {
    redisDownUntil = Date.now() + REDIS_RETRY_AFTER_MS;
    console.warn('[esi] scoreboard report failed', err);
  }
}

// Capture the body for the shared ETag cache when it's worth storing — but only
// for a response that arrives with a fixed Content-Length at or under the cap.
//
// This cache is CL-gated and ACTIVE, not dormant (verified 3.5.4a: a live scan
// found 58 cached bodies — 56 per-type orders + 2 small per-type history). ESI
// buffers small/medium per-type responses with a fixed Content-Length, and those
// ARE ETag/body-cached: per-type orders (/markets/{region}/orders/?type_id=…,
// the normal on-view price-refresh path) and SMALL per-type history. Only the
// large dumps stream chunked with NO Content-Length and are skipped — the bulk
// /markets/prices/ snapshot and LARGE per-type history (~400 rows ≈ 42 KB).
// Caching is purely size-gated; there is no per-endpoint opt-out.
//
// A no-Content-Length body can't be size-bounded without reading it, and reading
// it here via res.clone() is exactly what intermittently consumes the CALLER's
// body (the 3.5.1b "Body has already been read" bug); not reading it leaves the
// caller's body untouched. CL-bearing responses are the safe res.clone() path
// (zero "body already read" in 3.5.4a logs), and a 304 only re-serves a cached
// body when the data is unchanged — so the active cache is correct, not a hazard.
// The post-read check still guards a CL-present body whose DECODED size exceeds
// the cap (Content-Length is the compressed size).
//
// Decision (3.5.4a / Ryan, 2026-06-14): KEEP the body cache as-is. The 304/body
// reuse on per-type orders is a free-ish bandwidth win on the normal refresh
// path; an explicit history opt-out would be new mechanism for no measured
// benefit (the market-history DB stale-gate already dedups history same-day, so
// its body cache rarely pays off either way). Cost is ~4 extra Upstash ops
// (≈2 SET + 2 GET) per CL-bearing per-type fetch — accounted, not free.
async function captureBodyForCache(res: Response): Promise<string | null> {
  const contentLength = parseIntHeader(res.headers, 'Content-Length');
  if (contentLength === null || contentLength > BODY_CACHE_MAX_BYTES) {
    return null;
  }
  const text = await res.clone().text();
  if (new TextEncoder().encode(text).length > BODY_CACHE_MAX_BYTES) {
    return null;
  }
  return text;
}

// Re-serve a 304 as the 200 the caller would have gotten: cached body, the
// 304's own (fresh) headers, meta backfill for anything the 304 omitted, and
// a marker header for diagnostics.
function synthesizeRevalidated(
  res304: Response,
  body: string,
  meta: CachedEtagMeta,
): Response {
  const headers = new Headers(res304.headers);
  if (!headers.has('Content-Type') && meta.contentType !== null) {
    headers.set('Content-Type', meta.contentType);
  }
  if (!headers.has('Expires') && meta.expires !== null) {
    headers.set('Expires', meta.expires);
  }
  // The 304's zero length doesn't describe the synthesized body.
  headers.delete('Content-Length');
  headers.set('x-lgi-esi-cache', 'revalidated');
  return new Response(body, { status: 200, statusText: 'OK', headers });
}

// Consult the shared scoreboard, skipping while the outage memo is open. A
// pre-dispatch failure opens the memo (so a Redis outage doesn't add a timeout
// to every call) and reports as "no shared state" — null, which fails closed.
async function consultPreDispatch(
  sb: EsiScoreboard | null,
  url: string,
  wantEtag: boolean,
): Promise<PreDispatchState | null> {
  if (sb === null || Date.now() < redisDownUntil) return null;
  try {
    return await sb.preDispatch(url, wantEtag);
  } catch (err) {
    redisDownUntil = Date.now() + REDIS_RETRY_AFTER_MS;
    console.warn('[esi] scoreboard pre-dispatch failed', err);
    return null;
  }
}

// Refuse the call when the budget is spent. Without the shared mirror (pre ===
// null) we cannot know what other instances have spent, so fail closed:
// interactive callers get a hard-capped per-instance trickle, everything else
// throws. With it, honor a 429 Retry-After block and the error-budget floor.
function enforceBudget(
  pre: PreDispatchState | null,
  opts?: EsiFetchOptions,
): void {
  if (pre === null) {
    if (opts?.interactive !== true) {
      throw new EsiBudgetExhaustedError(0, 'scoreboard_unavailable');
    }
    const now = Date.now();
    if (now - trickleWindowStart >= 60_000) {
      trickleWindowStart = now;
      trickleCount = 0;
    }
    if (trickleCount >= TRICKLE_MAX_PER_MINUTE) {
      throw new EsiBudgetExhaustedError(0, 'trickle_capped');
    }
    trickleCount += 1;
    return;
  }
  if (pre.blockedRetryAfter !== null) {
    throw new EsiBudgetExhaustedError(pre.effectiveRemaining, 'rate_limited');
  }
  if (pre.effectiveRemaining < ESI_BUDGET_FLOOR) {
    throw new EsiBudgetExhaustedError(pre.effectiveRemaining, 'error_budget');
  }
}

// Re-serve a 304 from the shared body cache as the 200 the caller expected, or
// null when the cached body was evicted (the caller refetches once,
// unconditionally). Either way the 304's headers still feed the mirror.
async function reuseOrRevalidate(
  url: string,
  res304: Response,
  etagMeta: CachedEtagMeta,
  liveSb: EsiScoreboard | null,
): Promise<Response | null> {
  const freshMeta: CachedEtagMeta = {
    etag: res304.headers.get('ETag') ?? etagMeta.etag,
    expires: res304.headers.get('Expires') ?? etagMeta.expires,
    contentType: etagMeta.contentType,
  };
  let body: string | null = null;
  if (liveSb !== null) {
    try {
      body = await liveSb.getCachedBody(url);
    } catch {
      body = null;
    }
  }
  if (body !== null) {
    if (liveSb !== null) {
      await safeReport(
        liveSb,
        buildReport(url, res304, { etagToStore: null, refreshEtag: freshMeta }),
      );
    }
    return synthesizeRevalidated(res304, body, freshMeta);
  }
  if (liveSb !== null) {
    await safeReport(
      liveSb,
      buildReport(url, res304, { etagToStore: null, refreshEtag: null }),
    );
  }
  return null;
}

// Capture the body for the shared ETag cache when this 200 is cache-eligible
// (live scoreboard, an ETag-eligible request, a stored ETag, a CL-bounded
// body). Returns the payload to store, or null to skip caching.
async function captureEtagToStore(
  res: Response,
  liveSb: EsiScoreboard | null,
  wantEtag: boolean,
): Promise<EsiReport['etagToStore']> {
  if (liveSb === null || !wantEtag || res.status !== 200) return null;
  const etag = res.headers.get('ETag');
  if (etag === null) return null;
  const body = await captureBodyForCache(res);
  if (body === null) return null;
  return {
    etag,
    expires: res.headers.get('Expires'),
    contentType: res.headers.get('Content-Type'),
    body,
  };
}

// 420 ("you hit the limit, back off now") and 5xx abort the call — the report
// has already fed the mirror by the time we reach here. 2xx/3xx/4xx (incl. 429,
// whose Retry-After block gates the NEXT call) fall through to the caller.
function throwIfErrorStatus(res: Response): void {
  if (res.status === 420) {
    throw new EsiBudgetExhaustedError(0, 'esi_420');
  }
  if (res.status >= 500) {
    throw new EsiServerError(res.status);
  }
}

// At most two dispatches: the conditional attempt, plus one unconditional
// retry if a 304 arrives but the cached body has been evicted.
async function dispatch(
  url: string,
  init: RequestInit | undefined,
  wantEtag: boolean,
  liveSb: EsiScoreboard | null,
  etagMeta: CachedEtagMeta | null,
): Promise<Response> {
  for (;;) {
    const headers = buildHeaders(init, etagMeta?.etag ?? null);
    const res = await fetchWithTimeout(url, { ...init, headers });

    if (res.status === 304 && etagMeta !== null) {
      const served = await reuseOrRevalidate(url, res, etagMeta, liveSb);
      if (served !== null) return served;
      etagMeta = null;
      continue;
    }

    const etagToStore = await captureEtagToStore(res, liveSb, wantEtag);
    if (liveSb !== null) {
      await safeReport(
        liveSb,
        buildReport(url, res, { etagToStore, refreshEtag: null }),
      );
    }

    throwIfErrorStatus(res);
    return res;
  }
}

export async function esiFetch(
  url: string,
  init?: RequestInit,
  opts?: EsiFetchOptions,
): Promise<Response> {
  const sb = getScoreboard();
  const wantEtag = isEtagEligible(init);

  const pre = await consultPreDispatch(sb, url, wantEtag);
  enforceBudget(pre, opts);

  // Non-null only when this call's pre-dispatch actually consulted the shared
  // scoreboard — a report never goes where a check didn't come from.
  const liveSb = pre !== null ? sb : null;
  const etagMeta = pre !== null && wantEtag ? pre.etag : null;

  return dispatch(url, init, wantEtag, liveSb, etagMeta);
}
