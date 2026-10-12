/**
 * The one rule for every stored ESI answer: CCP's Expires is the only
 * freshness source. Until it passes nothing is called; after it, the call
 * carries If-None-Match, a 304 records the new expiry at once, and a 200
 * comes back with its meta for the caller to commit once its own write has
 * stood. Errors record nothing, so the next view retries. There are no
 * floors, no jitter and no delays.
 */
import { expireNow } from '@/lib/cache-expiry';
import { eveTag, routeDataset, routeDeclaration, type EsiRoute } from '@/lib/esi-datasets/routes';
import type { EsiHolder, EsiRouteDeclaration } from '@/lib/esi-datasets/types';
import { EsiBudgetExhaustedError, EsiServerError, esiFetch, esiUrl, type EsiFetchOptions } from '@/platform/esi';
import {
  readEsiAuthed,
  readEsiAuthedPost,
  readEsiPagedAuthed,
  type EsiAuthedRead,
  type EsiPagedRead,
} from '@/platform/esi/authed-read';
import { httpDateMs } from '@/platform/esi/headers';
import { esiJsonPostInit } from '@/platform/esi/request-init';
import { mapConcurrent } from '@/lib/fan-out';
import { earliestExpiry, expiryFor, isExpired } from './expiry';
import { esiHalted } from './halt';
import { resolvePath } from './key';
import { readRouteExpiry, readStoredRows, recordResponses, recordUnchangedMany, type UnchangedRecord } from './rows';
import type {
  EsiAnswerStamp,
  EsiParams,
  EsiResponseMeta,
  EsiStoreKey,
  StoredAuthedInit,
  StoredAuthedRead,
  StoredBatchAnswer,
  StoredFetch,
  StoredFetchInit,
  StoredManyAnswer,
  StoredManyInit,
  StoredPagedRead,
  StoredRow,
  StoredUnchanged,
} from './types';

export { haltOf, noteStatusOutcome, STATUS_KEY } from './downtime';
export type { DowntimeHalt } from './downtime';
export { expiryFor, isExpired, untilExpires } from './expiry';
export { storedRowJoin } from './rows';
export type {
  EsiAnswerStamp,
  EsiParams,
  EsiResponseMeta,
  EsiStoreKey,
  StoredAuthedInit,
  StoredAuthedRead,
  StoredBatchAnswer,
  StoredFetch,
  StoredFetchInit,
  StoredManyAnswer,
  StoredManyInit,
  StoredPagedRead,
  StoredRow,
} from './types';

/** The 'use cache' tag of the dataset a stored key feeds, for its holder: derived from the declaration, never spelled by a caller. */
export function datasetTag(key: EsiStoreKey): string {
  return eveTag(routeDataset(key.route), key.holder);
}

/** The declaration a stored read follows; a pass-through, tracker-only or wrongly held route is a programming error. */
function storedDeclaration(key: EsiStoreKey): EsiRouteDeclaration {
  const declaration = routeDeclaration(key.route);
  const mode = declaration.mode ?? 'stored';
  if (mode !== 'stored') throw new Error(`ESI route ${key.route} is declared ${mode}, not stored`);
  if (declaration.holder !== key.holder.kind) {
    throw new Error(`ESI route ${key.route} is held by ${declaration.holder}, not ${key.holder.kind}`);
  }
  return declaration;
}

async function readStoredRow(key: EsiStoreKey): Promise<StoredRow | null> {
  const [row] = await readStoredRows([key]);
  return row ?? null;
}

function unchanged(expiresAt: number | null): StoredUnchanged {
  return { kind: 'unchanged', expiresAt };
}

function unchangedRow(row: StoredRow | null): StoredUnchanged {
  return unchanged(row?.expiresAt ?? null);
}

/** The ETags to send back, every page's for a paged read; none when the route or this call is unconditional. */
function heldEtags(declaration: EsiRouteDeclaration, row: StoredRow | null, conditional: boolean | undefined): string[] {
  if (declaration.conditional === false || conditional === false) return [];
  return [...(row?.etags ?? [])];
}

function logAnswer(key: EsiStoreKey, status: string | number, cacheStatus: string | null | undefined): void {
  console.info('[esi-store]', { route: key.route, holder: key.holder.kind, status, cacheStatus: cacheStatus ?? null });
}

interface AnswerHeaders {
  readonly expiresAt: number | null;
  readonly lastModified?: string | null;
}

function metaOf(
  key: EsiStoreKey,
  declaration: EsiRouteDeclaration,
  answer: AnswerHeaders,
  etags: readonly string[],
  checkedAt: number,
  body?: unknown,
): EsiResponseMeta {
  return {
    key,
    expiresAt: expiryFor(answer.expiresAt, declaration.specCacheSeconds, checkedAt),
    etags,
    lastModified: httpDateMs(answer.lastModified ?? null),
    checkedAt,
    ...(body === undefined ? {} : { body }),
  };
}

/** A 304: the new expiry is recorded now, since no data write waits on it. */
async function settleUnchanged(
  key: EsiStoreKey,
  declaration: EsiRouteDeclaration,
  answer: AnswerHeaders,
  checkedAt: number,
): Promise<StoredUnchanged> {
  const record = unchangedRecord(key, declaration, answer, checkedAt);
  await recordUnchangedMany([record]);
  return unchanged(record.expiresAt);
}

/** What a 304 records for its key: the new expiry and check time, and Last-Modified when the answer carried one. */
function unchangedRecord(
  key: EsiStoreKey,
  declaration: EsiRouteDeclaration,
  answer: AnswerHeaders,
  checkedAt: number,
): UnchangedRecord {
  return {
    key,
    expiresAt: expiryFor(answer.expiresAt, declaration.specCacheSeconds, checkedAt),
    lastModified: httpDateMs(answer.lastModified ?? null),
    checkedAt,
  };
}

function responseAnswer(res: Response): AnswerHeaders {
  return { expiresAt: httpDateMs(res.headers.get('Expires')), lastModified: res.headers.get('Last-Modified') };
}

function etagsOf(etag: string | null): string[] {
  return etag === null ? [] : [etag];
}

/** One key of a batch: the declaration it follows and the row it holds, read before the fan-out. */
interface PublicCall {
  readonly key: EsiStoreKey;
  readonly declaration: EsiRouteDeclaration;
  readonly row: StoredRow | null;
}

/** A call's answer, with the 304 record the batch writes once every call is done. */
interface PublicAnswer {
  readonly answer: StoredManyAnswer;
  readonly unchanged?: UnchangedRecord;
}

async function callPublic(call: PublicCall, init: StoredFetchInit, checkedAt: number): Promise<PublicAnswer> {
  const { key, declaration, row } = call;
  const [etag] = heldEtags(declaration, row, init.conditional);
  const headers: Record<string, string> = etag === undefined ? {} : { 'If-None-Match': etag };
  const opts: EsiFetchOptions | undefined = init.interactive === true ? { interactive: true } : undefined;
  const res = await esiFetch(esiUrl(resolvePath(key)), { headers }, opts);
  logAnswer(key, res.status, res.headers.get('x-esi-cache-status'));
  const answer = responseAnswer(res);
  if (res.status === 304) {
    const record = unchangedRecord(key, declaration, answer, checkedAt);
    return { answer: unchanged(record.expiresAt), unchanged: record };
  }
  if (res.status !== 200) return { answer: { kind: 'error', status: res.status } };
  const body: unknown = declaration.keepBody === true ? await res.clone().json() : undefined;
  const meta = metaOf(key, declaration, answer, etagsOf(res.headers.get('ETag')), checkedAt, body);
  return { answer: { kind: 'fresh', res, meta } };
}

/**
 * The ESI calls of a batch, at most `concurrency` in flight, each failure
 * kept to its own key. Once the gate refuses one call for budget, the keys
 * not yet started take that refusal without calling: the gate would refuse
 * them the same way.
 */
async function fanOut(calls: readonly PublicCall[], init: StoredManyInit, checkedAt: number): Promise<PublicAnswer[]> {
  let refused: EsiBudgetExhaustedError | null = null;
  return mapConcurrent(calls, init.concurrency, async (call) => {
    if (refused !== null) return { answer: { kind: 'failed', error: refused } };
    try {
      return await callPublic(call, init, checkedAt);
    } catch (error) {
      if (error instanceof EsiBudgetExhaustedError) refused = error;
      return { answer: { kind: 'failed', error } };
    }
  });
}

/**
 * Many public GETs as one batch, the way a page with hundreds of due
 * prices or history series asks: one row read for every key, the expired
 * ones called with at most `concurrency` in flight, and every 304 recorded
 * in one write once the fan-out is done. Answers come back in key order.
 * No key takes a lock, global or owner: duplicates right after an expiry
 * are accepted, since CCP serves its shared copy or a 304 and the writes
 * behind them are idempotent. Under the downtime halt nothing is called
 * and every key serves its stored copy.
 */
export async function fetchStoredMany(keys: readonly EsiStoreKey[], init: StoredManyInit): Promise<StoredManyAnswer[]> {
  if (keys.length === 0) return [];
  const declarations = keys.map(storedDeclaration);
  const rows = await readStoredRows(keys);
  const checkedAt = Date.now();
  const due = keys.flatMap((_key, i) => (isExpired(rows[i]?.expiresAt ?? null, checkedAt) ? [i] : []));
  const answers: StoredManyAnswer[] = rows.map(unchangedRow);
  if (due.length === 0 || (await esiHalted(keys[due[0]!]!, checkedAt))) return answers;
  const calls = due.map((i) => ({ key: keys[i]!, declaration: declarations[i]!, row: rows[i] ?? null }));
  const settled = await fanOut(calls, init, checkedAt);
  due.forEach((i, n) => {
    answers[i] = settled[n]!.answer;
  });
  const unchangedRecords = settled.flatMap((call) => (call.unchanged === undefined ? [] : [call.unchanged]));
  if (unchangedRecords.length > 0) await recordUnchangedMany(unchangedRecords);
  return answers;
}

/** A public GET through the store: `fetchStoredMany` for one key, whose thrown call throws here as it always did. */
export async function fetchStored(key: EsiStoreKey, init: StoredFetchInit = {}): Promise<StoredFetch> {
  const answer = (await fetchStoredMany([key], { ...init, concurrency: 1 }))[0]!;
  if (answer.kind === 'failed') throw answer.error;
  return answer;
}

/**
 * A declared pass-through route: it always calls ESI and records nothing.
 * It has no stored copy to serve, so under the downtime halt it fails the
 * way ESI itself would, with a 503.
 */
export async function esiPassThrough(
  route: EsiRoute,
  params: EsiParams | undefined,
  init?: RequestInit,
  opts?: EsiFetchOptions,
): Promise<Response> {
  return esiFetch(esiUrl(await passThroughPath(route, params)), init, opts);
}

/** The concrete path of a pass-through call, once its declaration is checked and the downtime halt has let it through. */
async function passThroughPath(route: EsiRoute, params: EsiParams | undefined): Promise<string> {
  const declaration = routeDeclaration(route);
  if (declaration.mode !== 'pass-through') throw new Error(`ESI route ${route} is not declared pass-through`);
  const key: EsiStoreKey = { route, holder: { kind: 'global' }, params };
  if (await esiHalted(key, Date.now())) throw new EsiServerError(503, 'halted for daily downtime');
  return resolvePath(key);
}

/** A declared pass-through GET with a token (a structure lookup): always calls, never conditional, records nothing. */
export async function readPassThroughAuthed(route: EsiRoute, params: EsiParams, accessToken: string): Promise<EsiAuthedRead> {
  return readEsiAuthed(await passThroughPath(route, params), accessToken, null);
}

/** A declared pass-through POST-as-read with a token (assets/names): always calls and records nothing. */
export async function postPassThroughAuthed(
  route: EsiRoute,
  params: EsiParams,
  accessToken: string,
  body: unknown,
): Promise<EsiAuthedRead> {
  return readEsiAuthedPost(await passThroughPath(route, params), accessToken, body);
}

/**
 * A public POST whose one answer is fanned out over many keys (the
 * affiliation batch): the caller has already picked the due ids, so it
 * always calls, and hands back the response with the stamp every key in
 * the batch takes through `recordExpiryFor`. Under the downtime halt it
 * fails the way ESI itself would.
 */
export async function postStoredBatch(route: EsiRoute, body: unknown): Promise<StoredBatchAnswer> {
  const declaration = routeDeclaration(route);
  if (declaration.method !== 'POST' || (declaration.mode ?? 'stored') !== 'stored') {
    throw new Error(`ESI route ${route} is not a stored POST`);
  }
  const key: EsiStoreKey = { route, holder: { kind: 'global' } };
  const checkedAt = Date.now();
  if (await esiHalted(key, checkedAt)) throw new EsiServerError(503, 'halted for daily downtime');
  const res = await esiFetch(esiUrl(resolvePath(key)), esiJsonPostInit(body));
  logAnswer(key, res.status, res.headers.get('x-esi-cache-status'));
  const answer = responseAnswer(res);
  return {
    res,
    stamp: {
      expiresAt: expiryFor(answer.expiresAt, declaration.specCacheSeconds, checkedAt),
      lastModified: httpDateMs(answer.lastModified ?? null),
      checkedAt,
    },
  };
}

interface Prepared {
  readonly declaration: EsiRouteDeclaration;
  readonly row: StoredRow | null;
  readonly checkedAt: number;
}

async function prepareAuthed(key: EsiStoreKey, live = false): Promise<Prepared | StoredUnchanged> {
  const declaration = storedDeclaration(key);
  const row = await readStoredRow(key);
  const checkedAt = Date.now();
  const unexpired = !live && !isExpired(row?.expiresAt ?? null, checkedAt);
  if (unexpired || (await esiHalted(key, checkedAt))) return unchangedRow(row);
  return { declaration, row, checkedAt };
}

const isUnchanged = (prepared: Prepared | StoredUnchanged): prepared is StoredUnchanged => 'kind' in prepared;

async function settleAuthed(
  key: EsiStoreKey,
  prepared: Prepared,
  read: EsiAuthedRead,
): Promise<StoredAuthedRead> {
  logAnswer(key, read.kind === 'error' ? read.code : read.kind, read.kind === 'error' ? null : read.cacheStatus);
  if (read.kind === 'error') return read;
  if (read.kind === 'unchanged') return settleUnchanged(key, prepared.declaration, read, prepared.checkedAt);
  const meta = metaOf(key, prepared.declaration, read, etagsOf(read.etag), prepared.checkedAt);
  return { kind: 'fresh', body: read.body, etag: read.etag, meta };
}

/** An authed single-endpoint GET: `readEsiAuthed` behind the decision rule, or past it when the caller must see ESI live. */
export async function readStoredAuthed(
  key: EsiStoreKey,
  accessToken: string,
  init: StoredAuthedInit = {},
): Promise<StoredAuthedRead> {
  const prepared = await prepareAuthed(key, init.live === true);
  if (isUnchanged(prepared)) return prepared;
  const [etag] = heldEtags(prepared.declaration, prepared.row, undefined);
  return settleAuthed(key, prepared, await readEsiAuthed(resolvePath(key), accessToken, etag ?? null, init.rl));
}

/** An authed POST-as-read (the affiliation batch, assets/names): never conditional, same rule otherwise. */
export async function postStored(key: EsiStoreKey, accessToken: string, body: unknown): Promise<StoredAuthedRead> {
  const prepared = await prepareAuthed(key);
  if (isUnchanged(prepared)) return prepared;
  return settleAuthed(key, prepared, await readEsiAuthedPost(resolvePath(key), accessToken, body));
}

async function settlePaged(key: EsiStoreKey, prepared: Prepared, read: EsiPagedRead): Promise<StoredPagedRead> {
  logAnswer(key, read.kind === 'error' ? read.code : read.kind, read.kind === 'error' ? null : read.cacheStatus);
  if (read.kind === 'error') return read;
  if (read.kind === 'unchanged') return settleUnchanged(key, prepared.declaration, read, prepared.checkedAt);
  const meta = metaOf(key, prepared.declaration, read, read.etags, prepared.checkedAt);
  return { kind: 'fresh', items: read.items, etags: read.etags, responseHeaders: read.responseHeaders, meta };
}

/** An authed paged GET: every page's ETag goes back, and the earliest page Expires is the key's. */
export async function readStoredPaged(key: EsiStoreKey, accessToken: string, init: StoredAuthedInit = {}): Promise<StoredPagedRead> {
  const prepared = await prepareAuthed(key);
  if (isUnchanged(prepared)) return prepared;
  const etags = heldEtags(prepared.declaration, prepared.row, undefined);
  return settlePaged(key, prepared, await readEsiPagedAuthed(resolvePath(key), accessToken, etags, init.rl));
}

/** Whether any of `keys` has no stored answer or an expired one. Nothing to refresh is never due. */
export async function isDue(keys: readonly EsiStoreKey[], now: number = Date.now()): Promise<boolean> {
  const rows = await readStoredRows(keys);
  return rows.some((row) => isExpired(row?.expiresAt ?? null, now));
}

/** The earliest stored expiry over `keys`, in epoch ms; null when any key is due. */
export async function storedExpiry(keys: readonly EsiStoreKey[]): Promise<number | null> {
  if (keys.length === 0) return null;
  return earliestExpiry(await readStoredRows(keys));
}

/**
 * The earliest stored expiry over every answer of a route for one holder,
 * however it was parameterised: what a reader that aggregates a whole
 * route (the prices freshness stamp) lives until. Null when any is due.
 */
export function storedRouteExpiry(route: EsiRoute, holder: EsiHolder = { kind: 'global' }): Promise<number | null> {
  return readRouteExpiry(route, holder);
}

/** Each key's stored expiry in key order, in epoch ms; null where the key is due. */
export async function storedExpiries(keys: readonly EsiStoreKey[]): Promise<(number | null)[]> {
  const rows = await readStoredRows(keys);
  return rows.map((row) => row?.expiresAt ?? null);
}

/** One key's row as stored, body included (the keepBody routes read their document from it), or null. */
export function storedRow(key: EsiStoreKey): Promise<StoredRow | null> {
  return readStoredRow(key);
}

/**
 * The meta of a 5xx that is itself an answer: Tranquility down behind a
 * 503. It expires when the answer's Expires says, else at the route's spec
 * cache time, and carries no ETag.
 */
export function serverErrorMeta(key: EsiStoreKey, error: EsiServerError, checkedAt: number): EsiResponseMeta {
  const declaration = storedDeclaration(key);
  return metaOf(key, declaration, { expiresAt: httpDateMs(error.esiHeaders.expires ?? null) }, [], checkedAt);
}

/**
 * Records what committed 200s said, many rows a statement, without touching
 * the cache: for a cron or script outside a request, which clears its own
 * tag when it has one.
 */
export function recordMetas(metas: readonly EsiResponseMeta[]): Promise<void> {
  return recordResponses(metas);
}

/**
 * Records what the committed 200s said and clears the dataset's tag, so the
 * next read is a blocking miss onto the new rows rather than the old entry.
 * Call it after the domain write, inside the same after(). A 304 never
 * comes here: its expiry was recorded at once and the entry runs out alone.
 */
export async function commit(metas: readonly EsiResponseMeta[], opts: { readonly tag: string }): Promise<void> {
  if (metas.length === 0) return;
  await recordMetas(metas);
  expireNow(opts.tag);
}

/**
 * One answer fanned out to many keys: the region order dump prices every
 * type, and the affiliation batch answers for every character in it. Each
 * key takes the answer's expiry and Last-Modified; the answer's ETag and
 * body belong to the request that was made, not to the keys, so neither is
 * carried over.
 */
export function recordExpiryFor(keys: readonly EsiStoreKey[], stamp: EsiAnswerStamp): Promise<void> {
  return recordResponses(
    keys.map((key) => ({ key, expiresAt: stamp.expiresAt, etags: [], lastModified: stamp.lastModified, checkedAt: stamp.checkedAt })),
  );
}
