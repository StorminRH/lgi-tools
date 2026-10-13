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
import { intHeader } from './headers';
import {
  GROUP_FLOOR_SHARE,
  GROUP_FLOOR_SHARE_INTERACTIVE,
  HISTORY_CALLS_PER_MINUTE,
  NO_RESPONSE_STATUS,
  isHistoryPath,
  resolveScoreboard,
  __resetScoreboardForTests,
  type EsiReport,
  type EsiScoreboard,
  type GroupBudget,
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
 * How long this process trusts its last shared budget reading. Errors seen
 * locally since the reading count against it, and ESI's error-limit header on
 * each answer caps it, so the only blind spot is other instances' errors that
 * no answer here has reported yet.
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

/** The shared state of one path as this process last read it: its block and its group's budget. */
interface LocalPath {
  readAt: number;
  blockedUntil: number | null;
  seq: number;
  groupBudget?: GroupBudget;
}

/** Per normalized path: when the shared state was last read, what it said, and in what order. */
const localBlocks = new Map<string, LocalPath>();
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
  pendingReports = null;
  scoreboardOverride = null;
  __resetScoreboardForTests();
}

export function getScoreboard(): EsiScoreboard | null {
  if (scoreboardOverride === 'unavailable') return null;
  if (scoreboardOverride !== null) return scoreboardOverride;
  return resolveScoreboard();
}

/** The caller's headers, including any If-None-Match it holds, under the gate's identity headers. */
function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', OUTBOUND_USER_AGENT);
  }
  headers.set('X-Compatibility-Date', ESI_COMPATIBILITY_DATE);
  return headers;
}

function buildReport(url: string, res: Response): EsiReport {
  return {
    url,
    status: res.status,
    errorLimitRemain: intHeader(res.headers, 'X-ESI-Error-Limit-Remain'),
    errorLimitReset: intHeader(res.headers, 'X-ESI-Error-Limit-Reset'),
    retryAfter: intHeader(res.headers, 'Retry-After'),
    rlGroup: res.headers.get('X-Ratelimit-Group'),
    // "150/15m": the leading integer is the limit the Remaining is a share of.
    rlLimit: intHeader(res.headers, 'X-Ratelimit-Limit'),
    rlRemaining: intHeader(res.headers, 'X-Ratelimit-Remaining'),
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
    rlGroup: null,
    rlLimit: null,
    rlRemaining: null,
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
    // A caller that cancelled (a superseded typeahead) is no answer from ESI;
    // the gate's own timeout uses a separate signal and still counts.
    if (liveSb !== null && init.signal?.aborted !== true) await reportAnswer(liveSb, noResponseReport(url));
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
 * How long one batch of deferred reports takes new answers. A long fan-out
 * writes one pipeline a window instead of one per answer, and a batch whose
 * flush never runs (a request cut off at its maxDuration drops its after()
 * work) loses at most one window of reports, never every later one.
 */
const REPORT_BATCH_WINDOW_MS = 1_000;

/** Deferred reports waiting for the one after() that writes them. */
interface PendingReports {
  readonly sb: EsiScoreboard;
  readonly openedAt: number;
  readonly reports: EsiReport[];
}

let pendingReports: PendingReports | null = null;

function openBatch(sb: EsiScoreboard, now: number): PendingReports | null {
  const batch = pendingReports;
  return batch !== null && batch.sb === sb && now - batch.openedAt < REPORT_BATCH_WINDOW_MS ? batch : null;
}

/**
 * Writes a batch as one pipeline. It runs after the response, so a failure
 * is logged and never opens the instance-wide circuit: only a failed
 * pre-dispatch read or an error report written before its call returns says
 * the scoreboard is down for every call on this instance.
 */
async function flushReports(batch: PendingReports): Promise<void> {
  if (pendingReports === batch) pendingReports = null;
  try {
    await writeReports(batch.sb, batch.reports);
  } catch (err) {
    console.warn('[esi] deferred scoreboard report failed', err);
  }
}

async function writeReports(sb: EsiScoreboard, reports: readonly EsiReport[]): Promise<void> {
  if (sb.reportMany !== undefined) {
    await sb.reportMany(reports);
    return;
  }
  for (const report of reports) await sb.report(report);
}

/**
 * Successes and 304s are counted after the response, many in one write: an
 * answer joins the open batch, or opens one and schedules its flush. Where
 * nothing can run after the response (Convex, scripts), deferWork runs the
 * flush at once and the batch holds this one answer.
 */
async function deferReport(sb: EsiScoreboard, report: EsiReport): Promise<void> {
  const now = Date.now();
  const open = openBatch(sb, now);
  if (open !== null) {
    open.reports.push(report);
    return;
  }
  const batch: PendingReports = { sb, openedAt: now, reports: [report] };
  pendingReports = batch;
  await deferWork(() => flushReports(batch));
}

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
  await deferReport(sb, report);
}

/** The path's state as this process holds it, read back the way a shared reading comes. */
function pathState(path: LocalPath, now: number): Omit<PreDispatchState, 'effectiveRemaining'> {
  const state: Omit<PreDispatchState, 'effectiveRemaining'> = {
    blockedRetryAfter:
      path.blockedUntil !== null && path.blockedUntil > now
        ? Math.ceil((path.blockedUntil - now) / 1000)
        : null,
  };
  if (path.groupBudget !== undefined) state.groupBudget = path.groupBudget;
  return state;
}

/** The shared state from this process's recent reading, when both budget and path are fresh. */
function localPreDispatch(url: string, now: number): PreDispatchState | null {
  if (localBudget === null || now - localBudget.readAt >= LOCAL_BUDGET_REUSE_MS) return null;
  const path = localBlocks.get(normalizeEsiPath(url));
  if (path === undefined || now - path.readAt >= LOCAL_BUDGET_REUSE_MS) return null;
  return { effectiveRemaining: localBudget.remaining - localBudget.errorsSince, ...pathState(path, now) };
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

/** The block and group budget this call obeys on its path, by the same newest-wins rule. */
function rememberPath(url: string, pre: PreDispatchState, readSeq: number, now: number): Omit<PreDispatchState, 'effectiveRemaining'> {
  const path = normalizeEsiPath(url);
  const previous = localBlocks.get(path);
  if (previous !== undefined && previous.seq > readSeq) return pathState(previous, now);
  const entry: LocalPath = {
    readAt: now,
    blockedUntil: pre.blockedRetryAfter === null ? null : now + pre.blockedRetryAfter * 1000,
    seq: readSeq,
  };
  if (pre.groupBudget !== undefined) entry.groupBudget = pre.groupBudget;
  localBlocks.set(path, entry);
  return pathState(entry, now);
}

/** Keeps a shared reading for reuse and returns what this call should obey. */
function rememberPreDispatch(url: string, pre: PreDispatchState, readSeq: number, now: number): PreDispatchState {
  return { effectiveRemaining: rememberBudget(pre, readSeq, now), ...rememberPath(url, pre, readSeq, now) };
}

/**
 * Folds an answer's rate-limit headers into the path's local reading: the
 * group's Remaining on the answer is the newest truth for its bucket.
 */
function noteLocalPath(path: string, res: Response): void {
  const entry = localBlocks.get(path);
  if (entry === undefined) return;
  const group = res.headers.get('X-Ratelimit-Group');
  const remaining = intHeader(res.headers, 'X-Ratelimit-Remaining');
  const limit = intHeader(res.headers, 'X-Ratelimit-Limit');
  if (group !== null && remaining !== null && limit !== null) entry.groupBudget = { group, remaining, limit };
}

/**
 * Folds an answer this process just saw into its local reading until the next
 * shared one. ESI's own count of errors left already includes the answer, so
 * it caps the reading; the 429 block matches the shared one's clamp.
 */
function noteLocalAnswer(url: string, res: Response): void {
  const now = Date.now();
  const seq = ++localSeq;
  const path = normalizeEsiPath(url);
  const remain = intHeader(res.headers, 'X-ESI-Error-Limit-Remain');
  if (remain !== null) latestRemain = { value: remain, seq };
  if (res.status === 420) {
    localBudget = { remaining: 0, readAt: now, errorsSince: 0, seq };
  } else if (localBudget !== null) {
    if (res.status >= 400) localBudget.errorsSince += 1;
    if (remain !== null) {
      localBudget.remaining = Math.min(localBudget.remaining, remain + localBudget.errorsSince);
    }
  }
  noteLocalPath(path, res);
  if (res.status === 429) {
    const retryAfter = resolveRetryAfter(intHeader(res.headers, 'Retry-After'));
    localBlocks.set(path, { ...localBlocks.get(path), readAt: now, blockedUntil: now + retryAfter * 1000, seq });
  }
}

export async function consultPreDispatch(
  sb: EsiScoreboard | null,
  url: string,
): Promise<PreDispatchState | null> {
  if (sb === null || Date.now() < redisDownUntil) return null;
  const local = localPreDispatch(url, Date.now());
  if (local !== null) return local;
  const readSeq = ++localSeq;
  try {
    const pre = await sb.preDispatch(url);
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
  enforceGroupBudget(pre, resource, opts?.interactive === true);
}

/**
 * CCP asks clients to slow down as a group's Remaining nears zero. Below a
 * tenth of the group's limit only interactive calls go on, and below a
 * twentieth nothing does; the echo is lowest-wins across instances, so one
 * instance's low bucket slows every other.
 */
function enforceGroupBudget(pre: PreDispatchState, resource: string, interactive: boolean): void {
  if (pre.groupBudget === undefined) return;
  const floor = pre.groupBudget.limit * (interactive ? GROUP_FLOOR_SHARE_INTERACTIVE : GROUP_FLOOR_SHARE);
  if (pre.groupBudget.remaining < floor) {
    throwBudgetExhausted(pre.groupBudget.remaining, 'group_budget', null, resource);
  }
}

/**
 * Market history stays under its per-minute cap across every instance: each
 * call takes its place in the shared count before it is sent, by an atomic
 * increment (a counter, never a lock), so instances racing for the last
 * places can never all pass. A call whose place is past the cap is refused.
 * Without a scoreboard (an interactive call on the trickle) there is nothing
 * to reserve; a scoreboard that cannot reserve refuses history, and a
 * reservation that fails closes the gate the way a failed pre-dispatch read
 * does.
 */
export async function reserveHistoryCall(sb: EsiScoreboard | null, url: string): Promise<void> {
  const resource = normalizeEsiPath(url);
  if (sb === null || !isHistoryPath(resource)) return;
  if (sb.reserveHistoryCall === undefined) throwBudgetExhausted(0, 'history_cap', null, resource);
  let place: number;
  try {
    place = await sb.reserveHistoryCall();
  } catch (err) {
    redisDownUntil = Date.now() + REDIS_RETRY_AFTER_MS;
    console.warn('[esi] scoreboard history reservation failed', err);
    throwBudgetExhausted(0, 'scoreboard_unavailable', null, resource);
  }
  if (place > HISTORY_CALLS_PER_MINUTE) throwBudgetExhausted(0, 'history_cap', null, resource);
}

/** Every `x-esi-*` header on an answer, and its Expires, by lower-case name. */
function esiHeaders(headers: Headers): Record<string, string> {
  const picked: Record<string, string> = {};
  headers.forEach((value, name) => {
    if (name.startsWith('x-esi-') || name === 'expires') picked[name] = value;
  });
  return picked;
}

/** The body text of an error answer, or null when it cannot be read. */
async function safeText(res: Response): Promise<string | null> {
  try {
    return await res.text();
  } catch {
    return null;
  }
}

/** A 5xx keeps what ESI sent and is logged, so CCP's real downtime answer is on record. */
async function serverError(url: string, res: Response): Promise<EsiServerError> {
  const error = new EsiServerError(res.status, await safeText(res), esiHeaders(res.headers));
  console.warn('[esi] server error', {
    status: error.status,
    path: normalizeEsiPath(url),
    headers: error.esiHeaders,
    body: error.body,
  });
  return error;
}

/** A 304 is an answer, not an error: it comes back to the caller as ESI sent it. */
async function throwIfErrorStatus(url: string, res: Response): Promise<void> {
  if (res.status === 420) {
    throwBudgetExhausted(0, 'esi_420', null, normalizeEsiPath(url));
  }
  if (res.status === 429) {
    throwBudgetExhausted(
      intHeader(res.headers, 'X-Ratelimit-Remaining') ?? 0,
      'rate_limited',
      intHeader(res.headers, 'Retry-After'),
      normalizeEsiPath(url),
    );
  }
  if (res.status >= 500) {
    throw await serverError(url, res);
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
  liveSb: EsiScoreboard | null,
): Promise<Response> {
  const res = await fetchOrReportNoResponse(url, { ...init, headers: buildHeaders(init) }, liveSb);
  noteLocalAnswer(url, res);
  if (liveSb !== null) {
    await reportAnswer(liveSb, buildReport(url, res));
  }
  await throwIfErrorStatus(url, res);
  return res;
}
