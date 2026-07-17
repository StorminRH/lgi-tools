import { ESI_COMPATIBILITY_DATE } from '@/config/esi';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import {
  EsiBudgetExhaustedError,
  EsiServerError,
  ESI_BUDGET_FLOOR,
} from './errors';
import {
  BODY_CACHE_MAX_BYTES,
  resolveScoreboard,
  __resetScoreboardForTests,
  type CachedEtagMeta,
  type EsiReport,
  type EsiScoreboard,
  type PreDispatchState,
  normalizeEsiPath,
} from './scoreboard';

// The ESI gate engine: everything esiFetch (index.ts) orchestrates — the
// scoreboard consult, the budget enforcement, the conditional-request dispatch
// loop, and the per-instance fallback state. Lives beside the public entry so
// esiFetch stays a thin orchestrator over named single-purpose helpers.

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

/** Reset module-level state between Vitest cases. Not for runtime callers. */
export function __resetEsiGateForTests(): void {
  redisDownUntil = 0;
  trickleWindowStart = 0;
  trickleCount = 0;
  scoreboardOverride = null;
  __resetScoreboardForTests();
}

export function getScoreboard(): EsiScoreboard | null {
  if (scoreboardOverride === 'unavailable') return null;
  if (scoreboardOverride !== null) return scoreboardOverride;
  return resolveScoreboard();
}

/**
 * Conditional requests and body caching apply only to unauthenticated GETs:
 * the shared cache must never hold per-character data.
 */
export function isEtagEligible(init?: RequestInit): boolean {
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

// Refetch this many ms BEFORE the stored Expires actually lapses — bias the
// window check toward dispatching slightly early (the safe direction), so a
// little clock skew can never make us hand back a just-expired body.
const CACHE_SERVE_SKEW_MS = 5_000;

// True only while the stored Expires is still comfortably ahead of now. A
// missing or unparseable Expires reads as "not fresh" — fall through to a
// normal conditional dispatch rather than guess.
function isWithinExpiresWindow(expires: string | null): boolean {
  if (expires === null) return false;
  const expiresAt = Date.parse(expires);
  if (Number.isNaN(expiresAt)) return false;
  return Date.now() + CACHE_SERVE_SKEW_MS < expiresAt;
}

// Build the 200 the caller would have gotten, straight from the stored meta and
// cached body — no ESI round-trip happened, so there is no live response to copy
// headers from. The 'window' marker distinguishes this no-dispatch serve from
// the 304-'revalidated' one.
function synthesizeFromCache(body: string, meta: CachedEtagMeta): Response {
  const headers = new Headers();
  if (meta.contentType !== null) headers.set('Content-Type', meta.contentType);
  if (meta.expires !== null) headers.set('Expires', meta.expires);
  headers.set('ETag', meta.etag);
  headers.set('x-lgi-esi-cache', 'window');
  return new Response(body, { status: 200, statusText: 'OK', headers });
}

/**
 * Serve the stored body WITHOUT dispatching while ESI's own cache window (the
 * stored Expires) is still open and the body is still in the scoreboard. Returns
 * null — fall through to a normal conditional dispatch — when the window has
 * closed, the body was evicted, or the lookup errors. Makes no report: no ESI
 * call happened, so there are no fresh rate-limit numbers to record.
 */
export async function serveFromExpiresWindow(
  url: string,
  etagMeta: CachedEtagMeta,
  liveSb: EsiScoreboard,
): Promise<Response | null> {
  if (!isWithinExpiresWindow(etagMeta.expires)) return null;
  let body: string | null;
  try {
    body = await liveSb.getCachedBody(url);
  } catch {
    body = null;
  }
  if (body === null) return null;
  return synthesizeFromCache(body, etagMeta);
}

/**
 * Consult the shared scoreboard, skipping while the outage memo is open. A
 * pre-dispatch failure opens the memo (so a Redis outage doesn't add a timeout
 * to every call) and reports as "no shared state" — null, which fails closed.
 */
export async function consultPreDispatch(
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

/**
 * Refuse the call when the budget is spent. Without the shared mirror (pre ===
 * null) we cannot know what other instances have spent, so fail closed:
 * interactive callers get a hard-capped per-instance trickle, everything else
 * throws. With it, honor a 429 Retry-After block and the error-budget floor.
 */
export function enforceBudget(
  pre: PreDispatchState | null,
  url: string,
  opts?: EsiFetchOptions,
): void {
  const resource = normalizeEsiPath(url);
  if (pre === null) {
    if (opts?.interactive !== true) {
      throw new EsiBudgetExhaustedError(0, 'scoreboard_unavailable', null, resource);
    }
    const now = Date.now();
    if (now - trickleWindowStart >= 60_000) {
      trickleWindowStart = now;
      trickleCount = 0;
    }
    if (trickleCount >= TRICKLE_MAX_PER_MINUTE) {
      throw new EsiBudgetExhaustedError(0, 'trickle_capped', null, resource);
    }
    trickleCount += 1;
    return;
  }
  if (pre.blockedRetryAfter !== null) {
    throw new EsiBudgetExhaustedError(
      pre.effectiveRemaining,
      'rate_limited',
      pre.blockedRetryAfter,
      resource,
    );
  }
  if (pre.effectiveRemaining < ESI_BUDGET_FLOOR) {
    throw new EsiBudgetExhaustedError(
      pre.effectiveRemaining,
      'error_budget',
      null,
      resource,
    );
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

// 420, 429, and 5xx abort the call after the report has fed the mirror. A 429
// carries Retry-After metadata so owner refreshes can resume through the queue.
function throwIfErrorStatus(url: string, res: Response): void {
  if (res.status === 420) {
    throw new EsiBudgetExhaustedError(0, 'esi_420', null, normalizeEsiPath(url));
  }
  if (res.status === 429) {
    throw new EsiBudgetExhaustedError(
      parseIntHeader(res.headers, 'X-Ratelimit-Remaining') ?? 0,
      'rate_limited',
      parseIntHeader(res.headers, 'Retry-After'),
      normalizeEsiPath(url),
    );
  }
  if (res.status >= 500) {
    throw new EsiServerError(res.status);
  }
}

/**
 * At most two dispatches: the conditional attempt, plus one unconditional
 * retry if a 304 arrives but the cached body has been evicted.
 */
export async function dispatch(
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

    throwIfErrorStatus(url, res);
    return res;
  }
}
