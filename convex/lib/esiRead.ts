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
