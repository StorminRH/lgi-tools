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

// Capture the body for the shared ETag cache when it's worth storing. The
// Content-Length pre-check skips cloning the multi-hundred-KB region-dump
// pages; the post-read check covers chunked responses with no length header.
async function captureBodyForCache(res: Response): Promise<string | null> {
  const contentLength = parseIntHeader(res.headers, 'Content-Length');
  if (contentLength !== null && contentLength > BODY_CACHE_MAX_BYTES) {
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

export async function esiFetch(
  url: string,
  init?: RequestInit,
  opts?: EsiFetchOptions,
): Promise<Response> {
  const sb = getScoreboard();
  const wantEtag = isEtagEligible(init);

  // Consult the shared scoreboard (skipping while the outage memo is open).
  let pre: PreDispatchState | null = null;
  if (sb !== null && Date.now() >= redisDownUntil) {
    try {
      pre = await sb.preDispatch(url, wantEtag);
    } catch (err) {
      redisDownUntil = Date.now() + REDIS_RETRY_AFTER_MS;
      console.warn('[esi] scoreboard pre-dispatch failed', err);
    }
  }

  if (pre === null) {
    // Fail closed: without the shared mirror we cannot know what the other
    // instances have spent. Interactive callers get a hard-capped trickle.
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
  } else {
    if (pre.blockedRetryAfter !== null) {
      throw new EsiBudgetExhaustedError(pre.effectiveRemaining, 'rate_limited');
    }
    if (pre.effectiveRemaining < ESI_BUDGET_FLOOR) {
      throw new EsiBudgetExhaustedError(pre.effectiveRemaining, 'error_budget');
    }
  }

  // Non-null only when this call's pre-dispatch actually consulted the
  // shared scoreboard — a report never goes where a check didn't come from.
  const liveSb = pre !== null ? sb : null;
  let etagMeta = pre !== null && wantEtag ? pre.etag : null;

  // At most two dispatches: the conditional attempt, plus one unconditional
  // retry if a 304 arrives but the cached body has been evicted.
  for (;;) {
    const headers = buildHeaders(init, etagMeta?.etag ?? null);
    const res = await fetchWithTimeout(url, { ...init, headers });

    if (res.status === 304 && etagMeta !== null) {
      const freshMeta: CachedEtagMeta = {
        etag: res.headers.get('ETag') ?? etagMeta.etag,
        expires: res.headers.get('Expires') ?? etagMeta.expires,
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
            buildReport(url, res, { etagToStore: null, refreshEtag: freshMeta }),
          );
        }
        return synthesizeRevalidated(res, body, freshMeta);
      }
      // Cached body evicted under the meta: report the 304 (its headers still
      // feed the mirror) and refetch once, unconditionally.
      if (liveSb !== null) {
        await safeReport(
          liveSb,
          buildReport(url, res, { etagToStore: null, refreshEtag: null }),
        );
      }
      etagMeta = null;
      continue;
    }

    let etagToStore: EsiReport['etagToStore'] = null;
    if (liveSb !== null && wantEtag && res.status === 200) {
      const etag = res.headers.get('ETag');
      if (etag !== null) {
        const body = await captureBodyForCache(res);
        if (body !== null) {
          etagToStore = {
            etag,
            expires: res.headers.get('Expires'),
            contentType: res.headers.get('Content-Type'),
            body,
          };
        }
      }
    }

    if (liveSb !== null) {
      await safeReport(liveSb, buildReport(url, res, { etagToStore, refreshEtag: null }));
    }

    // 420 is ESI's "you hit the limit, back off now" sentinel. The scoreboard
    // echo was forced to zero in the report; refuse this call too.
    if (res.status === 420) {
      throw new EsiBudgetExhaustedError(0, 'esi_420');
    }

    if (res.status >= 500) {
      throw new EsiServerError(res.status);
    }

    // 2xx/3xx/4xx (including 429 — its Retry-After block gates the NEXT call)
    // pass through to the caller.
    return res;
  }
}
