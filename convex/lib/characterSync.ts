// Shared per-tracker sync mechanics — the pieces both the skills (3.4.7) and
// industry-jobs (3.4.8) sync flows need identically: the deployment-env guard,
// the Neon character enumeration, the per-character token vend, the cache-window
// resolution, and the engine subject-row stamp. Pure-ish leaves only (no Convex
// function exports), so nothing here lands on the deployed API surface. The
// per-dataset reads, parses, and apply bodies stay in their own tracker module.
import type { EveCharactersResponse } from '@/platform/auth/api-contract';
import { v } from 'convex/values';
import {
  eveCharactersEndpoint,
  eveTokenEndpoint,
} from '@/platform/auth/api-contract';
import { serviceFetch } from '@/platform/auth/service-client';
import { minCacheWindow } from '@/lib/sync-engine';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/** Validator fields shared by every per-character ESI sync result. */
export const characterSyncResultFields = {
  characterId: v.number(),
  expiresAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
};

/** Validator fields shared by every batched per-character apply mutation. */
export const characterSyncApplyFields = {
  userId: v.string(),
  generation: v.number(),
  enumeratedCharacterIds: v.array(v.number()),
  lastError: v.union(v.string(), v.null()),
  rlGroup: v.union(v.string(), v.null()),
  rlLimit: v.union(v.number(), v.null()),
  rlRemaining: v.union(v.number(), v.null()),
  rlUsed: v.union(v.number(), v.null()),
};

/** Resolves the authenticated Convex subject without duplicating viewer-query ceremony. */
export async function authenticatedSubject(ctx: QueryCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

/** Selects all or one character row set for idempotent purge mutations. */
export function selectCharacterRows<T>(
  characterId: number | null,
  readAll: () => Promise<T[]>,
  readOne: (characterId: number) => Promise<T[]>,
): Promise<T[]> {
  return characterId === null ? readAll() : readOne(characterId);
}

/**
 * Deployment-level config (set via `npx convex env set`) — the app's
 * NEXT_PUBLIC_* inlines don't exist in a Convex bundle.
 */
export interface SyncEnv {
  siteUrl: string;
  secret: string;
}

/**
 * Reads the Convex deployment URL and service secret, throwing when either required environment
 * value is absent.
 */
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
 * Neon on every run (no client-posted id carries authority). serviceFetch (not
 * bare fetch): a hung Next.js endpoint must fail fast into the Action Retrier
 * rather than holding the action open until the platform kills it, and the
 * response is validated against the endpoint's contract instead of asserted. A
 * non-success outcome is Neon-side trouble — transient by assumption; throw so
 * the retrier retries. A network/timeout rejection rethrows its original cause,
 * exactly as the bare-fetch call it replaced did.
 */
export async function fetchEnumeratedCharacters(
  env: SyncEnv,
  userId: string,
): Promise<EveCharactersResponse['characters']> {
  const outcome = await serviceFetch(eveCharactersEndpoint, {
    baseUrl: env.siteUrl,
    secret: env.secret,
    body: { userId },
  });
  if (outcome.ok) return outcome.data.characters;
  if (outcome.kind === 'network') throw outcome.cause;
  if (outcome.kind === 'protocol') {
    throw new Error(`eve-characters response failed its contract: ${outcome.detail}`);
  }
  throw new Error(`eve-characters returned ${outcome.status}`);
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

/**
 * Vends one short-lived EVE access token without exposing refresh-token custody; returns the
 * documented skip, reauth, or unavailable state for non-success responses.
 *
 * A response that claims success but fails the endpoint's contract now maps to
 * `unavailable` rather than propagating an unvalidated token shape. Network and
 * timeout rejections rethrow their original cause so the Action Retrier sees the
 * same failure the bare-fetch call site produced.
 */
export async function vendCharacterToken(
  env: SyncEnv,
  userId: string,
  characterId: number,
): Promise<TokenVend> {
  const outcome = await serviceFetch(eveTokenEndpoint, {
    baseUrl: env.siteUrl,
    secret: env.secret,
    body: { userId, characterId },
  });
  if (outcome.ok) return { kind: 'token', accessToken: outcome.data.accessToken };
  if (outcome.kind === 'network') throw outcome.cause;
  if (outcome.status === 404) return { kind: 'skip' };
  if (outcome.status === 409) return { kind: 'reauth' };
  return { kind: 'unavailable' };
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
  /**
   * The characters this run actually observed cleanly (fresh 200 OR 304).
   * Optional: only continuity-sensitive datasets (characterLocation) stamp it;
   * omitting it leaves the subject field untouched, so onlineStatus stamps
   * stay byte-identical.
   */
  coveredCharacterIds?: number[];
  lastError: string | null;
  rlGroup: string | null;
  rlLimit: number | null;
  rlRemaining: number | null;
  rlUsed: number | null;
}

/**
 * Persists one completed sync run onto its subject row, including cache windows, enumerated
 * character IDs, and rate-limit observations; lifecycle status is unchanged.
 */
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
    // Conditional spread, not `field: undefined` — a patched undefined REMOVES
    // the field in Convex; omission leaves the prior value unchanged.
    ...(stamp.coveredCharacterIds !== undefined
      ? { coveredCharacterIds: stamp.coveredCharacterIds }
      : {}),
    lastFinishedAt: now,
    lastError: stamp.lastError,
    rlGroup: stamp.rlGroup,
    rlLimit: stamp.rlLimit,
    rlRemaining: stamp.rlRemaining,
    rlUsed: stamp.rlUsed,
  });
}
