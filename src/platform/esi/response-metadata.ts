/**
 * Normalized ESI response metadata for one page, including page count, expiry, and rate-limit
 * observations.
 */
export interface EsiPageResponseHeaders {
  readonly page: number;
  readonly cacheControl: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly xPages: number;
}

/** Subset of normalized ESI headers retained with cached response bodies. */
export type EsiResponseHeaders = readonly EsiPageResponseHeaders[];
