import { BetterAuthError } from 'better-auth';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { cache } from 'react';
import { auth } from '@/features/auth/auth';
import { type LinkedCharacter, listLinkedCharacters } from '@/features/auth/linked-characters';
import { deriveCharacterHealth } from '@/features/auth/scope-health';
import { canSyncCorpIndustryJobs } from '@/features/industry-jobs/corp-sync-eligibility';
import { canSyncIndustryJobs } from '@/features/industry-jobs/sync-eligibility';
import { readEnv } from '@/lib/env';

// Whether the EVE auth secret is configured — derived exactly as the auth server
// does (auth.ts). The preview-deploy degradation is specifically "no auth env",
// so a BetterAuthError is swallowed silently ONLY when the secret is genuinely
// absent. A BetterAuthError while the secret IS set means a real misconfiguration
// (e.g. a corrupted secret in production) and must be logged, not hidden.
function authEnvConfigured(): boolean {
  return Boolean(readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET'));
}

// The signed-in pilot's linked characters, for the live trackers' request-time
// reads. Returns [] for signed-out viewers — and ALSO if the auth env is absent.
// /industry is a PUBLIC page, but the EVE auth env (BETTER_AUTH_SECRET et al.)
// is production-only, so `getSession` raises a BetterAuthError on Vercel preview
// deployments (unlike the auth-gated /jobs and /skills, which redirect). Degrade
// to the signed-out state there rather than crashing the page.
//
// Lives in its own module (not inline in page.tsx) so these request-time reads
// can be unit-tested without importing the page's Convex-backed client islands.
// Wrapped in React's request-scoped cache so the two boards (personal + corp)
// on /industry share ONE session + linked-character read per request rather than
// each issuing its own. Outside a request (unit tests) cache() is a passthrough.
const linkedJobCharacters = cache(async (): Promise<LinkedCharacter[]> => {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return [];
    return await listLinkedCharacters(session.user.id);
  } catch (err) {
    // Let Next.js handle its own control-flow errors first. Under Partial
    // Prerendering, the request-time `headers()` call throws a framework signal
    // to bail the static shell out to the dynamic hole — that must propagate,
    // not be swallowed or logged as an app error.
    unstable_rethrow(err);
    // Expected: on a Vercel preview the auth env is absent, so getSession raises
    // a BetterAuthError before any DB read. Degrade silently to signed-out —
    // but only when the secret really is missing, so a BetterAuthError with the
    // secret present (a prod misconfig) still falls through to the log below.
    if (err instanceof BetterAuthError && !authEnvConfigured()) return [];
    // Anything else (a real Neon failure for a signed-in pilot, or a misconfigured
    // auth env in production) is unexpected: log it before degrading, so an
    // outage isn't swallowed into the empty state.
    console.error(
      '[industry/active-job-character-ids] failed to resolve linked characters',
      err,
    );
    return [];
  }
});

// A character's missing scopes against the full requested superset — the input
// both per-feature eligibility predicates take.
function missingScopesOf(character: LinkedCharacter): string[] {
  return deriveCharacterHealth({
    scope: character.scope,
    hasRefreshToken: character.hasRefreshToken,
  }).missingScopes;
}

/**
 * The signed-in pilot's industry-job-eligible (per-character) ids, for the live
 * sync. [] for signed-out / auth-env-absent (see linkedJobCharacters).
 */
export async function activeJobCharacterIds(): Promise<number[]> {
  const characters = await linkedJobCharacters();
  return characters
    .filter((character) =>
      canSyncIndustryJobs({
        hasRefreshToken: character.hasRefreshToken,
        missingScopes: missingScopesOf(character),
      }),
    )
    .map((character) => character.characterId);
}

/**
 * The merged active-jobs board's corp slice: which characters can vend a corp
 * read (scope + token), and whether the pilot has any linked character at all.
 * The board derives its gate from these — no eligible chars but some linked →
 * scope-missing (offer the relink); none linked → render nothing.
 */
export interface CorpJobsAccess {
  eligibleCharacterIds: number[];
  hasLinkedCharacters: boolean;
}

/**
 * Returns corporation-job-eligible character IDs plus whether any linked character exists,
 * allowing the dashboard to distinguish missing scope from no account.
 */
export async function corpJobsAccess(): Promise<CorpJobsAccess> {
  const characters = await linkedJobCharacters();
  return {
    eligibleCharacterIds: characters
      .filter((character) =>
        canSyncCorpIndustryJobs({
          hasRefreshToken: character.hasRefreshToken,
          missingScopes: missingScopesOf(character),
        }),
      )
      .map((character) => character.characterId),
    hasLinkedCharacters: characters.length > 0,
  };
}
