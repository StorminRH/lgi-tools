// Shared per-tracker ESI read mechanics (extracted verbatim from the 3.4.7
// skills sync in 3.4.8 — the held-ETag conditional read and the rate-limit
// header harvest are identical-by-need across trackers). Pure helpers only:
// no Convex function exports, so nothing here lands on the deployed API
// surface. Run-lifecycle machinery lives in the 3.4.9 engine
// (convex/engine.ts); only the per-dataset reads and applies stay
// per-tracker.
import { esiFetch, esiUrl } from '@/lib/esi';

// Latest X-Ratelimit-* numbers seen this run — the token-bucket group usage
// the 3.4.9 engine will schedule against. Mutated in place as reads land.
export interface RlSnapshot {
  rlGroup: string | null;
  rlLimit: number | null;
  rlRemaining: number | null;
  rlUsed: number | null;
}

type EsiRead =
  | { kind: 'fresh'; body: unknown; etag: string | null; expiresAt: number | null }
  | { kind: 'unchanged'; expiresAt: number | null }
  | { kind: 'error'; code: string };

// One conditional read through the shared gate. The gate never attaches
// If-None-Match to Authorization-carrying requests (its ETag cache is
// unauthenticated-only), so each tracker replays its own held ETag and the
// raw 304 passes through — the 1-token path.
export async function readEsi(
  path: string,
  accessToken: string,
  heldEtag: string | null,
  rl: RlSnapshot,
): Promise<EsiRead> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (heldEtag !== null) headers['If-None-Match'] = heldEtag;
  const res = await esiFetch(esiUrl(path), { headers });
  captureRl(res, rl);
  const expiresAt = parseExpires(res);
  if (res.status === 304) {
    // No body to read on a 304 — and no ETag header to trust either.
    return { kind: 'unchanged', expiresAt };
  }
  if (res.status === 200) {
    return {
      kind: 'fresh',
      body: (await res.json()) as unknown,
      etag: res.headers.get('ETag'),
      expiresAt,
    };
  }
  return { kind: 'error', code: `esi_${res.status}` };
}

// The paginated twin of readEsi, for the owned-blueprints endpoints (?page= +
// X-Pages). Returns the assembled element array across all pages.
//
//  - 'unchanged' — a single-page collection whose held page-1 etag still matches
//    (the readEsi contract verbatim; the dominant character case).
//  - 'fresh' — the flattened items plus positional per-page etags (empty if any
//    page omitted an ETag, so a partial set never misaligns next run).
//  - 'error' — a 4xx (e.g. 403/404) or a body that isn't an array.
//
// A multi-page collection (large corps) is reassembled fresh across pages: it
// costs one ESI call per page either way, so v1 spends no per-page conditional
// bookkeeping to save bandwidth the per-character/per-corp call budget doesn't
// care about — the apply's deep-equal cold-skip keeps the reactive read quiet
// instead. A multi-page 304 fast path is a deferred optimization. 5xx/420/budget
// still throw out of esiFetch, as with readEsi (the caller's transient path).
export type PagedRead =
  | { kind: 'unchanged'; expiresAt: number | null }
  | { kind: 'fresh'; items: unknown[]; etags: string[]; expiresAt: number | null }
  | { kind: 'error'; code: string };

type PageFetch =
  | { kind: 'fresh'; body: unknown; etag: string | null; expiresAt: number | null; xPages: number }
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
  rl: RlSnapshot,
): Promise<PageFetch> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (etag !== null) headers['If-None-Match'] = etag;
  const res = await esiFetch(esiUrl(pagedPath(basePath, page)), { headers });
  captureRl(res, rl);
  const expiresAt = parseExpires(res);
  const xPages = intHeader(res, 'X-Pages') ?? 1;
  if (res.status === 304) return { kind: 'unchanged', expiresAt, xPages };
  if (res.status === 200) {
    return {
      kind: 'fresh',
      body: (await res.json()) as unknown,
      etag: res.headers.get('ETag'),
      expiresAt,
      xPages,
    };
  }
  return { kind: 'error', code: `esi_${res.status}` };
}

export async function readEsiPaged(
  basePath: string,
  accessToken: string,
  heldEtags: string[],
  rl: RlSnapshot,
): Promise<PagedRead> {
  // Page 1 doubles as the conditional probe (with the held page-1 etag) and the
  // X-Pages source.
  const first = await fetchPage(basePath, 1, heldEtags[0] ?? null, accessToken, rl);
  if (first.kind === 'error') return first;
  const pageCount = Math.max(1, first.xPages);

  if (pageCount === 1) {
    if (first.kind === 'unchanged') {
      // One page, and its held etag still matched → unchanged. The length check
      // confirms the stored set lines up (a collection that shrank to one page
      // falls through to a fresh refetch).
      if (heldEtags.length === 1) return { kind: 'unchanged', expiresAt: first.expiresAt };
      return finalizeFresh([await fetchPage(basePath, 1, null, accessToken, rl)]);
    }
    return finalizeFresh([first]);
  }

  // Multi-page → reassemble every page fresh (drop etags), page order preserved.
  // Reuse the probe's page 1 when it already came back fresh; otherwise (a 304
  // against the held etag) refetch it without an etag to recover its body.
  const firstFresh = first.kind === 'fresh' ? first : await fetchPage(basePath, 1, null, accessToken, rl);
  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_unused, i) =>
      fetchPage(basePath, i + 2, null, accessToken, rl),
    ),
  );
  return finalizeFresh([firstFresh, ...rest]);
}

function finalizeFresh(pages: PageFetch[]): PagedRead {
  const items: unknown[] = [];
  const etags: string[] = [];
  const windows: Array<number | null> = [];
  let allEtags = true;
  for (const page of pages) {
    if (page.kind === 'error') return page;
    // A null-etag fetch never yields a 304, so every page reaching here is fresh.
    if (page.kind === 'unchanged') return { kind: 'error', code: 'esi_unexpected_not_modified' };
    if (!Array.isArray(page.body)) return { kind: 'error', code: 'contract_error' };
    items.push(...page.body);
    if (page.etag === null) allEtags = false;
    else etags.push(page.etag);
    windows.push(page.expiresAt);
  }
  const present = windows.filter((w): w is number => w !== null);
  return {
    kind: 'fresh',
    items,
    etags: allEtags ? etags : [],
    expiresAt: present.length > 0 ? Math.min(...present) : null,
  };
}

function parseExpires(res: Response): number | null {
  const raw = res.headers.get('Expires');
  if (raw === null) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function captureRl(res: Response, rl: RlSnapshot): void {
  const group = res.headers.get('X-Ratelimit-Group');
  if (group === null) return;
  rl.rlGroup = group;
  rl.rlLimit = intHeader(res, 'X-Ratelimit-Limit');
  rl.rlRemaining = intHeader(res, 'X-Ratelimit-Remaining');
  rl.rlUsed = intHeader(res, 'X-Ratelimit-Used');
}

function intHeader(res: Response, name: string): number | null {
  const raw = res.headers.get(name);
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
