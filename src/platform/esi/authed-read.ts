import { esiPageCount, httpDateMs, intHeader } from './headers';
import { esiFetch, esiUrl } from './index';
import { esiAuthInit, esiJsonPostInit } from './request-init';
import type { EsiPageResponseHeaders, EsiResponseHeaders } from './response-metadata';

export interface RlSnapshot {
  rlGroup: string | null;
  rlLimit: number | null;
  rlRemaining: number | null;
  rlUsed: number | null;
}

export type EsiAuthedRead =
  | { kind: 'fresh'; body: unknown; etag: string | null; expiresAt: number | null }
  | { kind: 'unchanged'; expiresAt: number | null }
  | { kind: 'error'; code: string };

async function toAuthedRead(res: Response, rl?: RlSnapshot): Promise<EsiAuthedRead> {
  if (rl !== undefined) captureRl(res, rl);
  const expiresAt = httpDateMs(res.headers.get('Expires'));
  if (res.status === 304) return { kind: 'unchanged', expiresAt };
  if (res.status === 200) {
    return { kind: 'fresh', body: (await res.json()) as unknown, etag: res.headers.get('ETag'), expiresAt };
  }
  return { kind: 'error', code: `esi_${res.status}` };
}

export async function readEsiAuthed(
  path: string,
  accessToken: string,
  heldEtag: string | null,
  rl?: RlSnapshot,
): Promise<EsiAuthedRead> {
  return toAuthedRead(await esiFetch(esiUrl(path), esiAuthInit(accessToken, { etag: heldEtag })), rl);
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
  | { kind: 'unchanged'; expiresAt: number | null }
  | {
      kind: 'fresh';
      items: unknown[];
      etags: string[];
      expiresAt: number | null;
      responseHeaders: EsiResponseHeaders;
    }
  | { kind: 'error'; code: string };

type PageFetch =
  | {
      kind: 'fresh';
      body: unknown;
      etag: string | null;
      expiresAt: number | null;
      xPages: number;
      responseHeaders: EsiPageResponseHeaders;
    }
  | { kind: 'unchanged'; expiresAt: number | null; xPages: number }
  | { kind: 'error'; code: string };

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
  if (res.status === 304) return { kind: 'unchanged', expiresAt, xPages };
  if (res.status === 200) {
    const etagValue = res.headers.get('ETag');
    return {
      kind: 'fresh',
      body: (await res.json()) as unknown,
      etag: etagValue,
      expiresAt,
      xPages,
      responseHeaders: {
        page,
        cacheControl: res.headers.get('Cache-Control'),
        etag: etagValue,
        lastModified: res.headers.get('Last-Modified'),
        xPages,
      },
    };
  }
  return { kind: 'error', code: `esi_${res.status}` };
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
      if (heldEtags.length === 1) return { kind: 'unchanged', expiresAt: first.expiresAt };
      return finalizeFresh([await fetchPage(basePath, 1, null, accessToken, rl)]);
    }
    return finalizeFresh([first]);
  }

  const firstFresh = first.kind === 'fresh' ? first : await fetchPage(basePath, 1, null, accessToken, rl);
  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_unused, i) => fetchPage(basePath, i + 2, null, accessToken, rl)),
  );
  return finalizeFresh([firstFresh, ...rest]);
}

function finalizeFresh(pages: PageFetch[]): EsiPagedRead {
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
