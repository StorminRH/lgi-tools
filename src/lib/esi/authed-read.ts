// Authed ESI reads — the ONE shared conditional + paginated reader for every
// per-owner ESI consumer (MIGRATE.D.2 unified convex/lib/esiRead.ts into this).
//
// Two consumers, one implementation:
//   - the five Neon slow-data trackers (owned blueprints / assets, skills, char +
//     corp industry jobs) call it with NO `rl` — a stale-gated write-behind has no
//     cadence engine, so the rate-limit harvest has no consumer there;
//   - the Convex `onlineStatus` live canary (convex/onlineStatusSync.ts) passes an
//     `rl: RlSnapshot` so the live engine schedules its next run against the
//     observed token-bucket usage. The reader runs in the Convex action runtime
//     too — the shared ESI gate is runtime-portable, so one implementation serves
//     both (online keeps a Convex-side CALLER; the read mechanics are shared).
//
// The gate's own ETag cache is unauthenticated-only (it never attaches
// If-None-Match to an Authorization-carrying request), so an authed reader replays
// its own held ETag and the raw 304 passes straight through.
//
// 5xx / 420 / budget-exhaustion throw out of esiFetch (EsiServerError /
// EsiBudgetExhaustedError) — the per-owner caller catches them and skips that
// owner, the same best-effort posture as the affiliation refresh. A 4xx (403 a
// missing role, 404 a vanished owner) is a soft 'error' result, not a throw.
import { esiFetch, esiUrl } from './index';

// Latest X-Ratelimit-* numbers seen this run — the token-bucket group usage the
// Convex live engine schedules against. Mutated in place as reads land. Supplied
// ONLY by the online-status caller; the Neon trackers omit it (no harvest).
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

// One authed conditional read. Used for the corp-roles probe (which needs no
// pagination) and as the single-call building block. `rl`, when given, harvests
// the rate-limit headers off the response (the online-status cadence seam).
export async function readEsiAuthed(
  path: string,
  accessToken: string,
  heldEtag: string | null,
  rl?: RlSnapshot,
): Promise<EsiAuthedRead> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (heldEtag !== null) headers['If-None-Match'] = heldEtag;
  const res = await esiFetch(esiUrl(path), { headers });
  if (rl !== undefined) captureRl(res, rl);
  const expiresAt = parseExpires(res);
  if (res.status === 304) return { kind: 'unchanged', expiresAt };
  if (res.status === 200) {
    return { kind: 'fresh', body: (await res.json()) as unknown, etag: res.headers.get('ETag'), expiresAt };
  }
  return { kind: 'error', code: `esi_${res.status}` };
}

// The paginated read for the owned-blueprints / owned-assets endpoints (?page= +
// X-Pages), returning the flattened element array across all pages.
//
//  - 'unchanged' — a single-page collection whose held page-1 etag still matches
//    (the dominant character case): the caller bumps the staleness stamp and
//    leaves the stored rows untouched.
//  - 'fresh' — the flattened items plus per-page etags (empty if any page lacked
//    an ETag, so a partial set never misaligns next run).
//  - 'error' — a 4xx or a body that isn't an array.
//
// A multi-page collection (large corps) is reassembled fresh across pages: it
// costs one ESI call per page either way, so v1 spends no per-page conditional
// bookkeeping. A multi-page 304 fast path is a deferred optimization.
export type EsiPagedRead =
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
  rl?: RlSnapshot,
): Promise<PageFetch> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (etag !== null) headers['If-None-Match'] = etag;
  const res = await esiFetch(esiUrl(pagedPath(basePath, page)), { headers });
  if (rl !== undefined) captureRl(res, rl);
  const expiresAt = parseExpires(res);
  const xPages = intHeader(res, 'X-Pages') ?? 1;
  if (res.status === 304) return { kind: 'unchanged', expiresAt, xPages };
  if (res.status === 200) {
    return { kind: 'fresh', body: (await res.json()) as unknown, etag: res.headers.get('ETag'), expiresAt, xPages };
  }
  return { kind: 'error', code: `esi_${res.status}` };
}

export async function readEsiPagedAuthed(
  basePath: string,
  accessToken: string,
  heldEtags: string[],
  rl?: RlSnapshot,
): Promise<EsiPagedRead> {
  // Page 1 doubles as the conditional probe (with the held page-1 etag) and the
  // X-Pages source.
  const first = await fetchPage(basePath, 1, heldEtags[0] ?? null, accessToken, rl);
  if (first.kind === 'error') return first;
  const pageCount = Math.max(1, first.xPages);

  if (pageCount === 1) {
    if (first.kind === 'unchanged') {
      // One page, held etag still matched → unchanged, but only when the stored
      // set was also one page (a collection that shrank to one page refetches).
      if (heldEtags.length === 1) return { kind: 'unchanged', expiresAt: first.expiresAt };
      return finalizeFresh([await fetchPage(basePath, 1, null, accessToken, rl)]);
    }
    return finalizeFresh([first]);
  }

  // Multi-page → reassemble every page fresh (drop etags), page order preserved.
  // Reuse the probe's page 1 when it came back fresh; otherwise (a 304 against
  // the held etag) refetch it without an etag to recover its body.
  const firstFresh = first.kind === 'fresh' ? first : await fetchPage(basePath, 1, null, accessToken, rl);
  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_unused, i) => fetchPage(basePath, i + 2, null, accessToken, rl)),
  );
  return finalizeFresh([firstFresh, ...rest]);
}

function finalizeFresh(pages: PageFetch[]): EsiPagedRead {
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

// Harvest the X-Ratelimit-* token-bucket headers into the caller's snapshot. A
// no-op when the response carries no group header (e.g. a 304 from cache).
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
