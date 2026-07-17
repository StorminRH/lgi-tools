// Shared per-tracker sync mechanics — the pieces both the skills (3.4.7) and
// industry-jobs (3.4.8) sync flows need identically: the deployment-env guard,
// the Neon character enumeration, the per-character token vend, the cache-window
// resolution, and the engine subject-row stamp. Pure-ish leaves only (no Convex
// function exports), so nothing here lands on the deployed API surface. The
// per-dataset reads, parses, and apply bodies stay in their own tracker module.
import type { EveCharactersResponse, EveTokenOkResponse } from '@/features/auth/api-contract';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { minCacheWindow } from '@/lib/sync-engine';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

/**
 * Deployment-level config (set via `npx convex env set`) — the app's
 * NEXT_PUBLIC_* inlines don't exist in a Convex bundle.
 */
export interface SyncEnv {
  siteUrl: string;
  secret: string;
}

export function requireSyncEnv(): SyncEnv {
  const siteUrl = process.env.SITE_URL;
  const secret = process.env.CONVEX_SERVICE_SECRET;
  if (siteUrl === undefined || secret === undefined) {
    throw new Error('SITE_URL and CONVEX_SERVICE_SECRET must be set on this Convex deployment');
  }
  return { siteUrl, secret };
}

/**
 * The ownership boundary: which characters this user actually owns, read from
 * Neon on every run (no client-posted id carries authority). fetchWithTimeout
 * (not bare fetch): a hung Next.js endpoint must fail fast into the Action
 * Retrier rather than holding the action open until the platform kills it. A
 * non-ok response is Neon-side trouble — transient by assumption; throw so the
 * retrier retries.
 */
export async function fetchEnumeratedCharacters(
  env: SyncEnv,
  userId: string,
): Promise<EveCharactersResponse['characters']> {
  const res = await fetchWithTimeout(`${env.siteUrl}/api/internal/eve-characters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.secret}` },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    throw new Error(`eve-characters returned ${res.status}`);
  }
  return ((await res.json()) as EveCharactersResponse).characters;
}

/**
 * One per-character token vend. The refresh token never reaches Convex — the
 * endpoint returns only a short-lived access token. The status ladder is the
 * recorded taxonomy: 404 = unlinked between enumeration and vend (the next
 * run's enumeration deletes the doc — skip silently); 409 = reauth required;
 * any other non-ok = token unavailable.
 */
export type TokenVend =
  | { kind: 'token'; accessToken: string }
  | { kind: 'skip' }
  | { kind: 'reauth' }
  | { kind: 'unavailable' };

export async function vendCharacterToken(
  env: SyncEnv,
  userId: string,
  characterId: number,
): Promise<TokenVend> {
  const res = await fetchWithTimeout(`${env.siteUrl}/api/internal/eve-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.secret}` },
    body: JSON.stringify({ userId, characterId }),
  });
  if (res.status === 404) return { kind: 'skip' };
  if (res.status === 409) return { kind: 'reauth' };
  if (!res.ok) return { kind: 'unavailable' };
  const token = (await res.json()) as EveTokenOkResponse;
  return { kind: 'token', accessToken: token.accessToken };
}

/**
 * The next freshness window for a character from its read(s): the earliest
 * parseable Expires, or a dataset fallback when none carried one. Pure so the
 * fallback/earliest logic is unit-testable.
 */
export function resolveExpiresAt(
  windows: Array<number | null>,
  fallbackTtlMs: number,
  now: number,
): number {
  const present = windows.filter((w): w is number => w !== null);
  return present.length > 0 ? Math.min(...present) : now + fallbackTtlMs;
}

/**
 * Stamp the run's results onto the engine's subject row: the cache window the
 * next due time is computed from, the enumeration the heartbeat hint checks
 * against, and the rl* observability. status stays as-is — the workpool's
 * onComplete owns the lifecycle and clears it exactly once. Shared because the
 * subject row is the same `syncSubjects` table for every tracker.
 */
export interface SubjectStamp {
  enumeratedCharacterIds: number[];
  lastError: string | null;
  rlGroup: string | null;
  rlLimit: number | null;
  rlRemaining: number | null;
  rlUsed: number | null;
}

export async function stampSyncSubject(
  ctx: MutationCtx,
  subjectId: Id<'syncSubjects'>,
  windows: Array<number | null>,
  stamp: SubjectStamp,
  now: number,
): Promise<void> {
  await ctx.db.patch(subjectId, {
    minExpiresAt: minCacheWindow(windows),
    syncedCharacterIds: stamp.enumeratedCharacterIds,
    lastFinishedAt: now,
    lastError: stamp.lastError,
    rlGroup: stamp.rlGroup,
    rlLimit: stamp.rlLimit,
    rlRemaining: stamp.rlRemaining,
    rlUsed: stamp.rlUsed,
  });
}
