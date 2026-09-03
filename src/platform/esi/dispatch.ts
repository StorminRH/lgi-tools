import { ESI_COMPATIBILITY_DATE } from '@/config/esi';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import {
  EsiBudgetExhaustedError,
  EsiServerError,
  ESI_BUDGET_FLOOR,
  type EsiBudgetExhaustedReason,
} from './errors';
import { markRecentBudgetExhaustion } from './exhaustion-marker';
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

export interface EsiFetchOptions {
  interactive?: boolean;
}

const TRICKLE_MAX_PER_MINUTE = 10;
const REDIS_RETRY_AFTER_MS = 5_000;
let redisDownUntil = 0;
let trickleWindowStart = 0;
let trickleCount = 0;

let scoreboardOverride: EsiScoreboard | 'unavailable' | null = null;

/**
 * Replaces the process-local ESI scoreboard for an isolated test; production callers must never
 * use this seam.
 */
export function __setScoreboardForTests(
  sb: EsiScoreboard | 'unavailable' | null,
): void {
  scoreboardOverride = sb;
}

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
  const headers = new Headers(init?.headers);
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', OUTBOUND_USER_AGENT);
  }
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

async function safeReport(sb: EsiScoreboard, report: EsiReport): Promise<void> {
  try {
    await sb.report(report);
  } catch (err) {
    redisDownUntil = Date.now() + REDIS_RETRY_AFTER_MS;
    console.warn('[esi] scoreboard report failed', err);
  }
}

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
  headers.delete('Content-Length');
  headers.set('x-lgi-esi-cache', 'revalidated');
  return new Response(body, { status: 200, statusText: 'OK', headers });
}

const CACHE_SERVE_SKEW_MS = 5_000;

function isWithinExpiresWindow(expires: string | null): boolean {
  if (expires === null) return false;
  const expiresAt = Date.parse(expires);
  if (Number.isNaN(expiresAt)) return false;
  return Date.now() + CACHE_SERVE_SKEW_MS < expiresAt;
}

function synthesizeFromCache(body: string, meta: CachedEtagMeta): Response {
  const headers = new Headers();
  if (meta.contentType !== null) headers.set('Content-Type', meta.contentType);
  if (meta.expires !== null) headers.set('Expires', meta.expires);
  headers.set('ETag', meta.etag);
  headers.set('x-lgi-esi-cache', 'window');
  return new Response(body, { status: 200, statusText: 'OK', headers });
}

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

function throwBudgetExhausted(
  remaining: number,
  reason: EsiBudgetExhaustedReason,
  retryAfterSeconds: number | null,
  resource: string,
): never {
  markRecentBudgetExhaustion();
  throw new EsiBudgetExhaustedError(
    remaining,
    reason,
    retryAfterSeconds,
    resource,
  );
}

export function enforceBudget(
  pre: PreDispatchState | null,
  url: string,
  opts?: EsiFetchOptions,
): void {
  const resource = normalizeEsiPath(url);
  if (pre === null) {
    if (opts?.interactive !== true) {
      throwBudgetExhausted(0, 'scoreboard_unavailable', null, resource);
    }
    const now = Date.now();
    if (now - trickleWindowStart >= 60_000) {
      trickleWindowStart = now;
      trickleCount = 0;
    }
    if (trickleCount >= TRICKLE_MAX_PER_MINUTE) {
      throwBudgetExhausted(0, 'trickle_capped', null, resource);
    }
    trickleCount += 1;
    return;
  }
  if (pre.blockedRetryAfter !== null) {
    throwBudgetExhausted(
      pre.effectiveRemaining,
      'rate_limited',
      pre.blockedRetryAfter,
      resource,
    );
  }
  if (pre.effectiveRemaining < ESI_BUDGET_FLOOR) {
    throwBudgetExhausted(
      pre.effectiveRemaining,
      'error_budget',
      null,
      resource,
    );
  }
}

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

function throwIfErrorStatus(url: string, res: Response): void {
  if (res.status === 420) {
    throwBudgetExhausted(0, 'esi_420', null, normalizeEsiPath(url));
  }
  if (res.status === 429) {
    throwBudgetExhausted(
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
