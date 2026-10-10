import { ESI_COMPATIBILITY_DATE } from '@/config/esi';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { addDependencyTiming } from '@/lib/dependency-timing';
import { deferWork } from '@/lib/deferred-work';
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
  NO_RESPONSE_STATUS,
  resolveScoreboard,
  __resetScoreboardForTests,
  type CachedEtagMeta,
  type EsiReport,
  type EsiScoreboard,
  type PreDispatchState,
  normalizeEsiPath,
  resolveRetryAfter,
} from './scoreboard';

export interface EsiFetchOptions {
  interactive?: boolean;
}

const TRICKLE_MAX_PER_MINUTE = 10;
const REDIS_RETRY_AFTER_MS = 5_000;
let redisDownUntil = 0;
let trickleWindowStart = 0;
let trickleCount = 0;

/**
 * How long this process trusts its last shared budget reading for calls that
 * need no per-URL ETag read. Errors seen locally since the reading count
 * against it, and ESI's error-limit header on each answer caps it, so the only
 * blind spot is other instances' errors that no answer here has reported yet.
 */
const LOCAL_BUDGET_REUSE_MS = 1_000;

/**
 * Every shared read (when it starts) and every answer takes the next number
 * here, so the newest observation wins: a read never overwrites a reading or
 * block from a read that started later, or a 420 or 429 seen after it started.
 */
let localSeq = 0;

interface LocalBudget {
  remaining: number;
  readAt: number;
  errorsSince: number;
  /** When the read behind it started, or the 420 that closed it. */
  seq: number;
}

let localBudget: LocalBudget | null = null;
/** Per normalized path: when the shared block was last read, until when it holds, and in what order. */
const localBlocks = new Map<string, { readAt: number; blockedUntil: number | null; seq: number }>();
/** ESI's newest count of errors left, which already includes every error up to that answer. */
let latestRemain: { value: number; seq: number } | null = null;

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
  localBudget = null;
  localBlocks.clear();
  localSeq = 0;
  latestRemain = null;
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
    retryAfter: parseIntHeader(res.headers, 'Retry-After'),
    ...extras,
  };
}

/** What the scoreboard hears about a dispatch that got no answer from ESI. */
function noResponseReport(url: string): EsiReport {
  return {
    url,
    status: NO_RESPONSE_STATUS,
    errorLimitRemain: null,
    errorLimitReset: null,
    retryAfter: null,
    etagToStore: null,
    refreshEtag: null,
  };
}

async function fetchOrReportNoResponse(
  url: string,
  init: RequestInit,
  liveSb: EsiScoreboard | null,
): Promise<Response> {
  try {
    return await fetchFromEsi(url, init);
  } catch (error) {
    if (liveSb !== null) await reportAnswer(liveSb, noResponseReport(url));
    throw error;
  }
}

async function safeReport(sb: EsiScoreboard, report: EsiReport): Promise<void> {
  try {
    await sb.report(report);
  } catch (err) {
    redisDownUntil = Date.now() + REDIS_RETRY_AFTER_MS;
    console.warn('[esi] scoreboard report failed', err);
  }
}

/**
 * Below this many errors left in ESI's window, a success's echo is written
 * before the call returns as well. Every deferred echo then sits above it, so
 * one that lands late (after a long cron response) can never close the gate,
 * and the shared reading learns of a shrinking budget while the floor is still
 * ESI_BUDGET_FLOOR errors away.
 */
const DEFERRED_ECHO_MIN_REMAIN = ESI_BUDGET_FLOOR * 2;

/**
 * Error answers, and answers whose echo shows the budget running low, are
 * counted before the call returns, so the shared budget stays current; other
 * bookkeeping for successes and 304s runs after the response.
 */
async function reportAnswer(sb: EsiScoreboard, report: EsiReport): Promise<void> {
  const lowEcho = report.errorLimitRemain !== null && report.errorLimitRemain < DEFERRED_ECHO_MIN_REMAIN;
  if (report.status >= 400 || lowEcho) {
    await safeReport(sb, report);
    return;
  }
  await deferWork(() => safeReport(sb, report));
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

/** The shared state from this process's recent reading, when both budget and block are fresh. */
function localPreDispatch(url: string, now: number): PreDispatchState | null {
  if (localBudget === null || now - localBudget.readAt >= LOCAL_BUDGET_REUSE_MS) return null;
  const block = localBlocks.get(normalizeEsiPath(url));
  if (block === undefined || now - block.readAt >= LOCAL_BUDGET_REUSE_MS) return null;
  return {
    effectiveRemaining: localBudget.remaining - localBudget.errorsSince,
    blockedRetryAfter:
      block.blockedUntil !== null && block.blockedUntil > now
        ? Math.ceil((block.blockedUntil - now) / 1000)
        : null,
    etag: null,
  };
}

/**
 * The budget this call obeys. A newer reading (or a 420 since) outranks this
 * read and stays; otherwise the read is kept, capped by any error count ESI
 * reported after it started. Errors seen locally meanwhile are not taken off
 * again: their reports reach the shared count first, and the floor covers
 * the rest.
 */
function rememberBudget(pre: PreDispatchState, readSeq: number, now: number): number {
  if (localBudget !== null && localBudget.seq > readSeq) return localBudget.remaining - localBudget.errorsSince;
  const remaining =
    latestRemain !== null && latestRemain.seq > readSeq
      ? Math.min(pre.effectiveRemaining, latestRemain.value)
      : pre.effectiveRemaining;
  localBudget = { remaining, readAt: now, errorsSince: 0, seq: readSeq };
  return remaining;
}

/** The block this call obeys on its path, by the same newest-wins rule. */
function rememberBlock(url: string, pre: PreDispatchState, readSeq: number, now: number): number | null {
  const path = normalizeEsiPath(url);
  const previous = localBlocks.get(path);
  if (previous !== undefined && previous.seq > readSeq) {
    return previous.blockedUntil !== null && previous.blockedUntil > now
      ? Math.ceil((previous.blockedUntil - now) / 1000)
      : null;
  }
  const blockedUntil = pre.blockedRetryAfter === null ? null : now + pre.blockedRetryAfter * 1000;
  localBlocks.set(path, { readAt: now, blockedUntil, seq: readSeq });
  return pre.blockedRetryAfter;
}

/** Keeps a shared reading for reuse and returns what this call should obey. */
function rememberPreDispatch(url: string, pre: PreDispatchState, readSeq: number, now: number): PreDispatchState {
  return {
    ...pre,
    effectiveRemaining: rememberBudget(pre, readSeq, now),
    blockedRetryAfter: rememberBlock(url, pre, readSeq, now),
  };
}

/**
 * Folds an answer this process just saw into its local reading until the next
 * shared one. ESI's own count of errors left already includes the answer, so
 * it caps the reading; the 429 block matches the shared one's clamp.
 */
function noteLocalAnswer(url: string, res: Response): void {
  const now = Date.now();
  const seq = ++localSeq;
  const remain = parseIntHeader(res.headers, 'X-ESI-Error-Limit-Remain');
  if (remain !== null) latestRemain = { value: remain, seq };
  if (res.status === 420) {
    localBudget = { remaining: 0, readAt: now, errorsSince: 0, seq };
  } else if (localBudget !== null) {
    if (res.status >= 400) localBudget.errorsSince += 1;
    if (remain !== null) {
      localBudget.remaining = Math.min(localBudget.remaining, remain + localBudget.errorsSince);
    }
  }
  if (res.status === 429) {
    const retryAfter = resolveRetryAfter(parseIntHeader(res.headers, 'Retry-After'));
    localBlocks.set(normalizeEsiPath(url), { readAt: now, blockedUntil: now + retryAfter * 1000, seq });
  }
}

export async function consultPreDispatch(
  sb: EsiScoreboard | null,
  url: string,
  wantEtag: boolean,
): Promise<PreDispatchState | null> {
  if (sb === null || Date.now() < redisDownUntil) return null;
  if (!wantEtag) {
    const local = localPreDispatch(url, Date.now());
    if (local !== null) return local;
  }
  const readSeq = ++localSeq;
  try {
    const pre = await sb.preDispatch(url, wantEtag);
    return rememberPreDispatch(url, pre, readSeq, Date.now());
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
      await reportAnswer(
        liveSb,
        buildReport(url, res304, { etagToStore: null, refreshEtag: freshMeta }),
      );
    }
    return synthesizeRevalidated(res304, body, freshMeta);
  }
  if (liveSb !== null) {
    await reportAnswer(
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

/** One HTTP request to ESI, timed alone so scoreboard round trips stay out of ESI time. */
async function fetchFromEsi(url: string, init: RequestInit): Promise<Response> {
  const startedAt = performance.now();
  let status: number | undefined;
  try {
    const res = await fetchWithTimeout(url, init);
    status = res.status;
    return res;
  } finally {
    addDependencyTiming('esi', performance.now() - startedAt, status === undefined ? undefined : { status });
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
    const res = await fetchOrReportNoResponse(url, { ...init, headers }, liveSb);
    noteLocalAnswer(url, res);

    if (res.status === 304 && etagMeta !== null) {
      const served = await reuseOrRevalidate(url, res, etagMeta, liveSb);
      if (served !== null) return served;
      etagMeta = null;
      continue;
    }

    const etagToStore = await captureEtagToStore(res, liveSb, wantEtag);
    if (liveSb !== null) {
      await reportAnswer(
        liveSb,
        buildReport(url, res, { etagToStore, refreshEtag: null }),
      );
    }

    throwIfErrorStatus(url, res);
    return res;
  }
}
