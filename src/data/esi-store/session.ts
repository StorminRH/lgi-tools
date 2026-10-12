import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';
import type { EsiRoute } from '@/lib/esi-datasets/routes';
import type { PagedOwnerReadResult, ReadSession, SingleOwnerRead } from '@/platform/owner-sync';
import {
  commit,
  datasetTag,
  postPassThroughAuthed,
  readPassThroughAuthed,
  readStoredAuthed,
  readStoredPaged,
  refusalMeta,
} from './index';
import type { EsiParams, EsiResponseMeta, EsiStoreKey, StoredAuthedRead, StoredPagedRead } from './types';

/**
 * The ESI reads of one owner's refresh, as a sync port sees them. Each
 * stored read answers in the port's own shape and keeps the meta of a 200
 * aside; `commit` records every meta and clears each dataset's tag once
 * the owner's write has stood, so a crash between the two can never turn
 * later answers into 304s with nothing stored behind them. A stored read
 * ESI refused with a 403 keeps a refusal meta aside too (no ETag, the
 * 403's Expires or the route's spec cache time): a write that stood over
 * it (a sheet section saved as denied) records the refusal as that key's
 * answer, so nothing re-asks before it expires. A session that is never
 * committed records nothing, and the next view reads again.
 */
export interface EsiReadSession extends ReadSession {
  readAuthed(key: EsiStoreKey, accessToken: string): Promise<SingleOwnerRead>;
  readPaged(key: EsiStoreKey, accessToken: string): Promise<PagedOwnerReadResult>;
  /** A declared pass-through GET: always calls, records nothing (structure lookups). */
  readPassThrough(route: EsiRoute, params: EsiParams, accessToken: string): Promise<SingleOwnerRead>;
  /** A declared pass-through POST-as-read: always calls, records nothing (assets/names). */
  postPassThrough(route: EsiRoute, params: EsiParams, accessToken: string, body: unknown): Promise<SingleOwnerRead>;
  /**
   * The owner's write kept none of this session's 200 bodies (a sheet
   * section saved as denied): `commit` still records their expiries, so
   * nothing is re-called before CCP's Expires, but no ETags, so the first
   * read after it is unconditional and answers with a body again.
   */
  discardBodies(): void;
}

const SERVER_ERROR: { kind: 'error'; code: string; expiresAt?: number } = { kind: 'error', code: 'esi_server_error' };

const REFUSED = 'esi_403';

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

/** A meta whose body was not stored: the expiry stands, the ETag does not. */
function withoutEtags(meta: EsiResponseMeta): EsiResponseMeta {
  return { ...meta, etags: [] };
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
  let bodiesStored = true;
  /** Keeps a 200's meta, or a 403's refusal as the key's answer, aside for a write that stands over it. */
  function keepAside(key: EsiStoreKey, read: StoredAuthedRead | StoredPagedRead | typeof SERVER_ERROR): void {
    if (read.kind === 'fresh') metas.push(read.meta);
    else if (read.kind === 'error' && read.code === REFUSED) metas.push(refusalMeta(key, read.expiresAt ?? null, Date.now()));
  }
  return {
    async readAuthed(key, accessToken) {
      const read = await softRead(() => readStoredAuthed(key, accessToken));
      keepAside(key, read);
      return read.kind === 'fresh' ? { kind: 'fresh', body: read.body, etag: read.etag } : read;
    },
    async readPaged(key, accessToken) {
      const read = await softRead(() => readStoredPaged(key, accessToken));
      keepAside(key, read);
      return read.kind === 'fresh'
        ? { kind: 'fresh', items: read.items, etags: read.etags, responseHeaders: read.responseHeaders }
        : read;
    },
    readPassThrough(route, params, accessToken) {
      return softRead(() => readPassThroughAuthed(route, params, accessToken));
    },
    postPassThrough(route, params, accessToken, body) {
      return softRead(() => postPassThroughAuthed(route, params, accessToken, body));
    },
    discardBodies() {
      bodiesStored = false;
    },
    async commit() {
      const recorded = bodiesStored ? metas : metas.map(withoutEtags);
      for (const [tag, group] of groupByTag(recorded)) await commit(group, { tag });
      metas.length = 0;
      bodiesStored = true;
    },
  };
}
