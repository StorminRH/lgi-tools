import { BetterAuthError } from 'better-auth';
import { headers } from 'next/headers';
import { auth } from '@/features/auth/auth';
import { listLinkedCharacters } from '@/features/auth/queries';
import { deriveCharacterHealth } from '@/features/auth/scope-health';
import { canSyncIndustryJobs } from '@/features/industry-jobs/sync-eligibility';

// The signed-in pilot's industry-job-eligible character ids, for the live sync.
// Returns [] for signed-out viewers — and ALSO if the auth env is absent.
// /industry is a PUBLIC page, but the EVE auth env (BETTER_AUTH_SECRET et al.)
// is production-only, so `getSession` raises a BetterAuthError on Vercel preview
// deployments (unlike the auth-gated /jobs and /skills, which redirect). Degrade
// to the signed-out jobs state there rather than crashing the page.
//
// Lives in its own module (not inline in page.tsx) so this request-time read can
// be unit-tested without importing the page's Convex-backed client islands.
export async function activeJobCharacterIds(): Promise<number[]> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return [];
    const characters = await listLinkedCharacters(session.user.id);
    return characters
      .filter((character) =>
        canSyncIndustryJobs({
          hasRefreshToken: character.hasRefreshToken,
          missingScopes: deriveCharacterHealth({
            scope: character.scope,
            hasRefreshToken: character.hasRefreshToken,
          }).missingScopes,
        }),
      )
      .map((character) => character.characterId);
  } catch (err) {
    // Expected: on a Vercel preview the auth env is absent, so getSession raises
    // a BetterAuthError before any DB read. Degrade silently to signed-out.
    if (err instanceof BetterAuthError) return [];
    // Unexpected (e.g. a real Neon failure for a signed-in pilot): log it before
    // degrading, so a production outage isn't swallowed into the empty state.
    console.error(
      '[industry/active-job-character-ids] failed to resolve linked characters',
      err,
    );
    return [];
  }
}
