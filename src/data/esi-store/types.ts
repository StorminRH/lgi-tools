import type { EsiRoute } from '@/lib/esi-datasets/routes';
import type { EsiHolder } from '@/lib/esi-datasets/types';
import type { RlSnapshot } from '@/platform/esi/authed-read';
import type { EsiResponseHeaders } from '@/platform/esi/response-metadata';

export type EsiParams = Readonly<Record<string, string | number>>;

/**
 * The identity of one stored answer: a declared route, whose rows hold it,
 * and the request's path and query parameters. Path placeholders the holder
 * does not fill (`{region_id}`, `{structure_id}`) come from `params`; the
 * rest become the query string.
 */
export interface EsiStoreKey {
  readonly route: EsiRoute;
  readonly holder: EsiHolder;
  readonly params?: EsiParams;
}

/**
 * What one 200 from ESI said about itself. The store hands it back instead
 * of recording it, and the caller commits it after its own write succeeds:
 * a crash between an ETag write and the data write would otherwise turn
 * every later answer into a 304 that never stores the data.
 */
export interface EsiResponseMeta {
  readonly key: EsiStoreKey;
  /** Epoch ms; already falls back to the route's spec cache time when ESI sent no Expires. */
  readonly expiresAt: number | null;
  readonly etags: readonly string[];
  readonly lastModified: number | null;
  readonly checkedAt: number;
  readonly body?: unknown;
}

/**
 * What one answer said about its own lifetime: the stamp a response's keys
 * are recorded under. Every `EsiResponseMeta` carries one; a fanned-out
 * answer (the affiliation batch) carries only this, since the request made
 * belongs to no single key.
 */
export interface EsiAnswerStamp {
  readonly expiresAt: number | null;
  readonly lastModified: number | null;
  readonly checkedAt: number;
}

/** One esi_responses row as the store reads it. */
export interface StoredRow {
  readonly expiresAt: number | null;
  readonly etags: readonly string[];
  readonly lastModified: number | null;
  readonly checkedAt: number;
  readonly body: unknown;
}

export interface StoredUnchanged {
  readonly kind: 'unchanged';
  readonly expiresAt: number | null;
}

/** A 200 comes back parsed, never as a live Response: its body was read inside its own call. */
export type StoredFetch<T> =
  | StoredUnchanged
  | { readonly kind: 'fresh'; readonly value: T; readonly meta: EsiResponseMeta }
  | { readonly kind: 'error'; readonly status: number };

export interface StoredFetchInit<T> {
  /** False never sends If-None-Match for this call, whatever the route declares (the cron region dump). */
  readonly conditional?: boolean;
  /** A user is waiting on the answer: the gate holds it to the lower interactive floor. */
  readonly interactive?: boolean;
  /**
   * Turns a 200's JSON body (and its headers, for X-Pages) into the value
   * the caller wants. It runs inside the key's own call, so a batch never
   * holds unread bodies while the rest of it runs; a throw fails that key.
   */
  readonly parse: (body: unknown, headers: Headers) => T;
}

export interface StoredManyInit<T> extends StoredFetchInit<T> {
  /** How many ESI calls the batch keeps in flight: the route's share of CCP's limits, set by the caller. */
  readonly concurrency: number;
}

/**
 * One key's answer in a batched read: what `fetchStored` answers, or the
 * error that key's call threw (a budget refusal, a 5xx, a body its parser
 * refused), kept to that key so the rest of the batch still answers.
 */
export type StoredManyAnswer<T> = StoredFetch<T> | { readonly kind: 'failed'; readonly error: unknown };

export interface StoredAuthedInit {
  readonly rl?: RlSnapshot;
  /**
   * Calls ESI even while the stored copy is unexpired: the corp mutation
   * gates re-check roles live. The call is still conditional, so an
   * unchanged answer costs a 304 and records the new expiry.
   */
  readonly live?: true;
  /**
   * False never sends If-None-Match for this call, whatever the route
   * declares: a held ETag that no stored row answers for (roles bound to
   * another corporation) must not turn the read into a 304.
   */
  readonly conditional?: boolean;
  /** A user is waiting on the answer (the live role check on a corp mutation): the gate's interactive floor. */
  readonly interactive?: boolean;
}

/** A public POST answered once for many keys: the response as ESI sent it, with the stamp its keys take. */
export interface StoredBatchAnswer {
  readonly res: Response;
  readonly stamp: EsiAnswerStamp;
}

/** `SingleOwnerRead` plus the meta a port commits after its save. */
export type StoredAuthedRead =
  | StoredUnchanged
  | { readonly kind: 'fresh'; readonly body: unknown; readonly etag: string | null; readonly meta: EsiResponseMeta }
  | { readonly kind: 'error'; readonly code: string; readonly expiresAt?: number };

/** `PagedOwnerReadResult` plus the meta a port commits after its save. */
export type StoredPagedRead =
  | StoredUnchanged
  | {
      readonly kind: 'fresh';
      readonly items: unknown[];
      readonly etags: string[];
      readonly responseHeaders: EsiResponseHeaders;
      readonly meta: EsiResponseMeta;
    }
  | { readonly kind: 'error'; readonly code: string; readonly expiresAt?: number };

/** The seconds a 'use cache' entry built from stored data may live: Next expires it when CCP's copy does. */
export interface CacheLifeUntilExpires {
  readonly stale: number;
  readonly revalidate: number;
  readonly expire: number;
}
