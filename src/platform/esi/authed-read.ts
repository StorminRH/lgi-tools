import { mapConcurrent } from '@/lib/fan-out';
import { esiPageCount, httpDateMs, intHeader } from './headers';
import { esiFetch, esiUrl, type EsiFetchOptions } from './index';
import { esiAuthInit, esiJsonPostInit } from './request-init';
import type { EsiPageResponseHeaders, EsiResponseHeaders } from './response-metadata';

/** Pages of one paged read in flight at once, after page 1 has said how many there are. */
export const PAGED_READ_CONCURRENCY = 8;

export interface RlSnapshot {
  rlGroup: string | null;
  rlLimit: number | null;
  rlRemaining: number | null;
  rlUsed: number | null;
}

/**
 * `lastModified` and `cacheStatus` are ESI's Last-Modified and
 * x-esi-cache-status on the answer, beside Expires. They are optional so a
 * caller that builds a read by hand need not supply them.
 */
export type EsiAuthedRead =
  | {
      kind: 'fresh';
      body: unknown;
      etag: string | null;
      expiresAt: number | null;
      lastModified?: string | null;
      cacheStatus?: string | null;
    }
  | { kind: 'unchanged'; expiresAt: number | null; lastModified?: string | null; cacheStatus?: string | null }
  | { kind: 'error'; code: string; expiresAt?: number };

/** A status ESI answered with neither a body nor a 304. */
type EsiReadError = Extract<EsiAuthedRead, { kind: 'error' }>;

/**
 * The error for `status`, with the answer's own Expires when it sent one: a
 * refusal (a 403) is settled until then, and the caller records it as the
 * key's answer.
 */
function readError(status: number, expiresAt: number | null): EsiReadError {
  return { kind: 'error', code: `esi_${status}`, ...(expiresAt === null ? {} : { expiresAt }) };
}

async function toAuthedRead(res: Response, rl?: RlSnapshot): Promise<EsiAuthedRead> {
  if (rl !== undefined) captureRl(res, rl);
  const expiresAt = httpDateMs(res.headers.get('Expires'));
  const cache = captureCacheHeaders(res);
  if (res.status === 304) return { kind: 'unchanged', expiresAt, ...cache };
  if (res.status === 200) {
    return { kind: 'fresh', body: (await res.json()) as unknown, etag: res.headers.get('ETag'), expiresAt, ...cache };
  }
  return readError(res.status, expiresAt);
}

/** One authed GET; `opts` carries the gate's interactive floor when a user is waiting on it. */
export async function readEsiAuthed(
  path: string,
  accessToken: string,
  heldEtag: string | null,
  rl?: RlSnapshot,
  opts?: EsiFetchOptions,
): Promise<EsiAuthedRead> {
  return toAuthedRead(await esiFetch(esiUrl(path), esiAuthInit(accessToken, { etag: heldEtag }), opts), rl);
}

/**
 * A POST-as-read (ESI's `assets/names` takes its id list in the body). A POST
 * is never ETag-eligible, so every call reaches ESI and the result is fresh or
 * an error.
 */
export async function readEsiAuthedPost(path: string, accessToken: string, body: unknown): Promise<EsiAuthedRead> {
  return toAuthedRead(await esiFetch(esiUrl(path), esiJsonPostInit(body, accessToken)));
}

/**
 * The paginated read for the owned-blueprints / owned-assets endpoints (?page= +
 * X-Pages), returning the flattened element array across all pages.
 *
 *  - 'unchanged' — a single-page collection whose held page-1 etag still matches
 *    (the dominant character case): the caller bumps the staleness stamp and
 *    leaves the stored rows untouched.
 *  - 'fresh' — the flattened items plus per-page etags (empty if any page lacked
 *    an ETag, so a partial set never misaligns next run).
 *  - 'error' — a 4xx or a body that isn't an array.
 *
 * A multi-page collection (large corps) is reassembled fresh across pages: it
 * costs one ESI call per page either way, so v1 spends no per-page conditional
 * bookkeeping. A multi-page 304 fast path is a deferred optimization.
 */
export type EsiPagedRead =
  | { kind: 'unchanged'; expiresAt: number | null; lastModified?: string | null; cacheStatus?: string | null }
  | {
      kind: 'fresh';
      items: unknown[];
      etags: string[];
      expiresAt: number | null;
      responseHeaders: EsiResponseHeaders;
      lastModified?: string | null;
      cacheStatus?: string | null;
    }
  | { kind: 'error'; code: string; expiresAt?: number };

interface PageCacheHeaders {
  lastModified: string | null;
  cacheStatus: string | null;
}

type PageFetch =
  | ({
      kind: 'fresh';
      body: unknown;
      etag: string | null;
      expiresAt: number | null;
      xPages: number;
      responseHeaders: EsiPageResponseHeaders;
    } & PageCacheHeaders)
  | ({ kind: 'unchanged'; expiresAt: number | null; xPages: number } & PageCacheHeaders)
  | EsiReadError;

function pagedPath(basePath: string, page: number): string {
  return `${basePath}${basePath.includes('?') ? '&' : '?'}page=${page}`;
}

async function fetchPage(
  basePath: string,
  page: number,
  etag: string | null,
  accessToken: string,
  rl?: RlSnapshot,
): Promise<PageFetch> {
  const res = await esiFetch(esiUrl(pagedPath(basePath, page)), esiAuthInit(accessToken, { etag }));
  if (rl !== undefined) captureRl(res, rl);
  const expiresAt = httpDateMs(res.headers.get('Expires'));
  const xPages = esiPageCount(res.headers);
  const cache = captureCacheHeaders(res);
  if (res.status === 304) return { kind: 'unchanged', expiresAt, xPages, ...cache };
  if (res.status === 200) {
    const etagValue = res.headers.get('ETag');
    return {
      kind: 'fresh',
      body: (await res.json()) as unknown,
      etag: etagValue,
      expiresAt,
      xPages,
      ...cache,
      responseHeaders: {
        page,
        cacheControl: res.headers.get('Cache-Control'),
        etag: etagValue,
        lastModified: res.headers.get('Last-Modified'),
        xPages,
      },
    };
  }
  return readError(res.status, expiresAt);
}

export async function readEsiPagedAuthed(
  basePath: string,
  accessToken: string,
  heldEtags: string[],
  rl?: RlSnapshot,
): Promise<EsiPagedRead> {
  const first = await fetchPage(basePath, 1, heldEtags[0] ?? null, accessToken, rl);
  if (first.kind === 'error') return first;
  const pageCount = first.xPages;

  if (pageCount === 1) {
    if (first.kind === 'unchanged') {
      if (heldEtags.length === 1) return { kind: 'unchanged', expiresAt: first.expiresAt, ...pageCacheHeaders(first) };
      return finalizeFresh([await fetchPage(basePath, 1, null, accessToken, rl)]);
    }
    return finalizeFresh([first]);
  }

  const firstFresh = first.kind === 'fresh' ? first : await fetchPage(basePath, 1, null, accessToken, rl);
  const pages = Array.from({ length: pageCount - 1 }, (_unused, i) => i + 2);
  const rest = await mapConcurrent(pages, PAGED_READ_CONCURRENCY, (page) => fetchPage(basePath, page, null, accessToken, rl));
  return finalizeFresh([firstFresh, ...rest]);
}

function finalizeFresh(pages: [PageFetch, ...PageFetch[]]): EsiPagedRead {
  const items: unknown[] = [];
  const etags: string[] = [];
  const responseHeaders: EsiPageResponseHeaders[] = [];
  const windows: Array<number | null> = [];
  let allEtags = true;
  for (const page of pages) {
    if (page.kind === 'error') return page;
    if (page.kind === 'unchanged') return { kind: 'error', code: 'esi_unexpected_not_modified' };
    if (!Array.isArray(page.body)) return { kind: 'error', code: 'contract_error' };
    items.push(...page.body);
    if (page.etag === null) allEtags = false;
    else etags.push(page.etag);
    responseHeaders.push(page.responseHeaders);
    windows.push(page.expiresAt);
  }
  const present = windows.filter((w): w is number => w !== null);
  return {
    kind: 'fresh',
    items,
    etags: allEtags ? etags : [],
    expiresAt: present.length > 0 ? Math.min(...present) : null,
    responseHeaders,
    ...pageCacheHeaders(pages[0]),
  };
}

/** Page 1's cache headers speak for a paged read; every page's Last-Modified is in responseHeaders. */
function pageCacheHeaders(page: PageFetch): Partial<PageCacheHeaders> {
  return page.kind === 'error' ? {} : { lastModified: page.lastModified, cacheStatus: page.cacheStatus };
}

function captureCacheHeaders(res: Response): PageCacheHeaders {
  return {
    lastModified: res.headers.get('Last-Modified'),
    cacheStatus: res.headers.get('x-esi-cache-status'),
  };
}

function captureRl(res: Response, rl: RlSnapshot): void {
  const group = res.headers.get('X-Ratelimit-Group');
  if (group === null) return;
  rl.rlGroup = group;
  rl.rlLimit = intHeader(res.headers, 'X-Ratelimit-Limit');
  rl.rlRemaining = intHeader(res.headers, 'X-Ratelimit-Remaining');
  rl.rlUsed = intHeader(res.headers, 'X-Ratelimit-Used');
}
