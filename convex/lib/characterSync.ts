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
import { runObservabilityFields } from './syncFields';

export const characterSyncResultFields = {
  characterId: v.number(),
  expiresAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
};

export const characterSyncApplyFields = {
  userId: v.string(),
  generation: v.number(),
  enumeratedCharacterIds: v.array(v.number()),
  ...runObservabilityFields,
};

export async function authenticatedSubject(ctx: QueryCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

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

export type TokenVend =
  | { kind: 'token'; accessToken: string; expiresAt: number }
  | { kind: 'skip' }
  | { kind: 'reauth' }
  | { kind: 'unavailable' };

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
  if (outcome.ok) {
    return {
      kind: 'token',
      accessToken: outcome.data.accessToken,
      expiresAt: outcome.data.expiresAt,
    };
  }
  if (outcome.kind === 'network') throw outcome.cause;
  if (outcome.status === 404) return { kind: 'skip' };
  if (outcome.status === 409) return { kind: 'reauth' };
  return { kind: 'unavailable' };
}

export function resolveExpiresAt(
  windows: Array<number | null>,
  fallbackTtlMs: number,
  now: number,
): number {
  const present = windows.filter((w): w is number => w !== null);
  return present.length > 0 ? Math.min(...present) : now + fallbackTtlMs;
}

export interface SubjectStamp {
  enumeratedCharacterIds: number[];
  coveredCharacterIds?: number[];
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
