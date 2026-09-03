export interface EsiPageResponseHeaders {
  readonly page: number;
  readonly cacheControl: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly xPages: number;
}

export type EsiResponseHeaders = readonly EsiPageResponseHeaders[];
