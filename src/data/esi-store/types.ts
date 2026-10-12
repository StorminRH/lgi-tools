import type { EsiRoute } from '@/lib/esi-datasets/routes';
import type { EsiHolder } from '@/lib/esi-datasets/types';
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

export type StoredFetch =
  | StoredUnchanged
  | { readonly kind: 'fresh'; readonly res: Response; readonly meta: EsiResponseMeta }
  | { readonly kind: 'error'; readonly status: number };

export interface StoredFetchInit {
  /** False never sends If-None-Match for this call, whatever the route declares (the cron region dump). */
  readonly conditional?: boolean;
  readonly interactive?: boolean;
}

/** `SingleOwnerRead` plus the meta a port commits after its save. */
export type StoredAuthedRead =
  | StoredUnchanged
  | { readonly kind: 'fresh'; readonly body: unknown; readonly etag: string | null; readonly meta: EsiResponseMeta }
  | { readonly kind: 'error'; readonly code: string };

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
  | { readonly kind: 'error'; readonly code: string };

/** The seconds a 'use cache' entry built from stored data may live: Next expires it when CCP's copy does. */
export interface CacheLifeUntilExpires {
  readonly stale: number;
  readonly revalidate: number;
  readonly expire: number;
}
