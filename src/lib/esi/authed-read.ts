// Neon-side authed ESI reads (MIGRATE.0) — the conditional + paginated reads the
// Neon slow-data trackers use, reusable by the live-tracker migrations (A–D).
//
// These are the twins of convex/lib/esiRead.ts, deliberately WITHOUT its
// `RlSnapshot` rate-limit harvest: that snapshot feeds the Convex presence
// engine's per-token-group cadence scheduling, a concept the Neon on-view path
// (a stale-gated write-behind, no engine) does not have. The shared ESI budget
// is still enforced inside esiFetch. The small overlap with the Convex pair is
// transient — it converges when the live trackers leave Convex (session D); the
// Convex helper stays untouched so the still-live jobs/skills trackers are not
// disturbed.
//
// The gate's own ETag cache is unauthenticated-only (it never attaches
// If-None-Match to an Authorization-carrying request), so an authed reader
// replays its own held ETag and the raw 304 passes straight through.
//
// 5xx / 420 / budget-exhaustion throw out of esiFetch (EsiServerError /
// EsiBudgetExhaustedError) — the per-owner caller catches them and skips that
// owner, the same best-effort posture as the affiliation refresh. A 4xx (403 a
// missing role, 404 a vanished owner) is a soft 'error' result, not a throw.
import { esiFetch, esiUrl } from './index';

export type EsiAuthedRead =
  | { kind: 'fresh'; body: unknown; etag: string | null; expiresAt: number | null }
  | { kind: 'unchanged'; expiresAt: number | null }
  | { kind: 'error'; code: string };

// One authed conditional read. Used for the corp-roles probe (which needs no
// pagination) and as the single-call building block.
export async function readEsiAuthed(
  path: string,
  accessToken: string,
  heldEtag: string | null,
): Promise<EsiAuthedRead> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (heldEtag !== null) headers['If-None-Match'] = heldEtag;
  const res = await esiFetch(esiUrl(path), { headers });
  const expiresAt = parseExpires(res);
  if (res.status === 304) return { kind: 'unchanged', expiresAt };
  if (res.status === 200) {
    return { kind: 'fresh', body: (await res.json()) as unknown, etag: res.headers.get('ETag'), expiresAt };
  }
  return { kind: 'error', code: `esi_${res.status}` };
}

// The paginated read for the owned-blueprints endpoints (?page= + X-Pages),
// returning the flattened element array across all pages.
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
): Promise<PageFetch> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (etag !== null) headers['If-None-Match'] = etag;
  const res = await esiFetch(esiUrl(pagedPath(basePath, page)), { headers });
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
): Promise<EsiPagedRead> {
  // Page 1 doubles as the conditional probe (with the held page-1 etag) and the
  // X-Pages source.
  const first = await fetchPage(basePath, 1, heldEtags[0] ?? null, accessToken);
  if (first.kind === 'error') return first;
  const pageCount = Math.max(1, first.xPages);

  if (pageCount === 1) {
    if (first.kind === 'unchanged') {
      // One page, held etag still matched → unchanged, but only when the stored
      // set was also one page (a collection that shrank to one page refetches).
      if (heldEtags.length === 1) return { kind: 'unchanged', expiresAt: first.expiresAt };
      return finalizeFresh([await fetchPage(basePath, 1, null, accessToken)]);
    }
    return finalizeFresh([first]);
  }

  // Multi-page → reassemble every page fresh (drop etags), page order preserved.
  // Reuse the probe's page 1 when it came back fresh; otherwise (a 304 against
  // the held etag) refetch it without an etag to recover its body.
  const firstFresh = first.kind === 'fresh' ? first : await fetchPage(basePath, 1, null, accessToken);
  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_unused, i) => fetchPage(basePath, i + 2, null, accessToken)),
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

function intHeader(res: Response, name: string): number | null {
  const raw = res.headers.get(name);
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
