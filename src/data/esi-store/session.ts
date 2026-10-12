import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';
import type { EsiRoute } from '@/lib/esi-datasets/routes';
import type { PagedOwnerReadResult, ReadSession, SingleOwnerRead } from '@/platform/owner-sync';
import { commit, datasetTag, postPassThroughAuthed, readPassThroughAuthed, readStoredAuthed, readStoredPaged } from './index';
import type { EsiParams, EsiResponseMeta, EsiStoreKey } from './types';

/**
 * The ESI reads of one owner's refresh, as a sync port sees them. Each
 * stored read answers in the port's own shape and keeps the meta of a 200
 * aside; `commit` records every meta and clears each dataset's tag once
 * the owner's write has stood, so a crash between the two can never turn
 * later answers into 304s with nothing stored behind them. A session that
 * is never committed records nothing, and the next view reads again.
 */
export interface EsiReadSession extends ReadSession {
  readAuthed(key: EsiStoreKey, accessToken: string): Promise<SingleOwnerRead>;
  readPaged(key: EsiStoreKey, accessToken: string): Promise<PagedOwnerReadResult>;
  /** A declared pass-through GET: always calls, records nothing (structure lookups). */
  readPassThrough(route: EsiRoute, params: EsiParams, accessToken: string): Promise<SingleOwnerRead>;
  /** A declared pass-through POST-as-read: always calls, records nothing (assets/names). */
  postPassThrough(route: EsiRoute, params: EsiParams, accessToken: string, body: unknown): Promise<SingleOwnerRead>;
}

const SERVER_ERROR: { kind: 'error'; code: string } = { kind: 'error', code: 'esi_server_error' };

/**
 * Runs one authed ESI read for a sync port. An EsiServerError becomes the
 * soft `esi_server_error` result; a budget deferral or any other failure
 * still throws.
 */
async function softRead<T>(read: () => Promise<T>): Promise<T | typeof SERVER_ERROR> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof EsiBudgetExhaustedError) throw error;
    if (error instanceof EsiServerError) return SERVER_ERROR;
    throw error;
  }
}

/** The tags a set of metas clears: one per dataset and holder, however many keys fed it. */
function groupByTag(metas: readonly EsiResponseMeta[]): Map<string, EsiResponseMeta[]> {
  const groups = new Map<string, EsiResponseMeta[]>();
  for (const meta of metas) {
    const tag = datasetTag(meta.key);
    groups.set(tag, [...(groups.get(tag) ?? []), meta]);
  }
  return groups;
}

export function openReadSession(): EsiReadSession {
  const metas: EsiResponseMeta[] = [];
  return {
    async readAuthed(key, accessToken) {
      const read = await softRead(() => readStoredAuthed(key, accessToken));
      if (read.kind !== 'fresh') return read;
      metas.push(read.meta);
      return { kind: 'fresh', body: read.body, etag: read.etag };
    },
    async readPaged(key, accessToken) {
      const read = await softRead(() => readStoredPaged(key, accessToken));
      if (read.kind !== 'fresh') return read;
      metas.push(read.meta);
      return { kind: 'fresh', items: read.items, etags: read.etags, responseHeaders: read.responseHeaders };
    },
    readPassThrough(route, params, accessToken) {
      return softRead(() => readPassThroughAuthed(route, params, accessToken));
    },
    postPassThrough(route, params, accessToken, body) {
      return softRead(() => postPassThroughAuthed(route, params, accessToken, body));
    },
    async commit() {
      for (const [tag, group] of groupByTag(metas)) await commit(group, { tag });
      metas.length = 0;
    },
  };
}
