import { v } from 'convex/values';
import { eveTokenEndpoint } from '@/platform/auth/api-contract';
import { serviceFetch } from '@/platform/auth/service-client';

export const characterSyncResultFields = {
  characterId: v.number(),
  expiresAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
};

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
