import { BetterAuthError } from 'better-auth';
import { cacheLife } from 'next/cache';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { cache } from 'react';
import { auth } from '@/composition/auth';
import { type LinkedCharacter, listLinkedCharacters } from '@/platform/auth/linked-characters';
import { type PanelCharacter, toPanelCharacter } from '@/platform/auth/panel-character';
import { deriveCharacterHealth } from '@/platform/auth/scope-health';
import { canSyncCorpIndustryJobs } from '@/features/industry-jobs/corp-sync-eligibility';
import { canSyncIndustryJobs } from '@/features/industry-jobs/sync-eligibility';
import { readEnv } from '@/lib/env';

export interface IndustryCharacters {
  /** Every linked character, as the job boards list them. */
  characters: PanelCharacter[];
  /** The characters whose personal jobs can sync. */
  jobIds: number[];
  /** The characters that can read their corporation's jobs. */
  corpIds: number[];
}

type SyncEligibility = (eligibility: { hasRefreshToken: boolean; missingScopes: string[] }) => boolean;

function authEnvConfigured(): boolean {
  return Boolean(readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET'));
}

function eligibleIds(linked: readonly LinkedCharacter[], canSync: SyncEligibility): number[] {
  return linked
    .filter((character) =>
      canSync({
        hasRefreshToken: character.hasRefreshToken,
        missingScopes: deriveCharacterHealth({
          scope: character.scope,
          hasRefreshToken: character.hasRefreshToken,
        }).missingScopes,
      }),
    )
    .map((character) => character.characterId);
}

/**
 * The account's linked characters as the industry sections use them. Cached
 * in the browser per session, so each section's App Shell carries them and
 * moving between sections draws them at once instead of asking again.
 */
async function readIndustryCharacters(): Promise<IndustryCharacters | null> {
  'use cache: private';
  cacheLife('minutes');
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const linked = await listLinkedCharacters(session.user.id);
  return {
    characters: linked.map((character) => toPanelCharacter(character, canSyncIndustryJobs)),
    jobIds: eligibleIds(linked, canSyncIndustryJobs),
    corpIds: eligibleIds(linked, canSyncCorpIndustryJobs),
  };
}

/** The signed-in account's industry characters; null when signed out, or when auth is not set up locally. */
export const industryCharacters = cache(async (): Promise<IndustryCharacters | null> => {
  try {
    return await readIndustryCharacters();
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof BetterAuthError && !authEnvConfigured()) return null;
    throw err;
  }
});

/** The ids the Profiles section's job feeds read. A failed read gives none instead of failing the section. */
export async function jobCharacterIds(): Promise<Pick<IndustryCharacters, 'jobIds' | 'corpIds'>> {
  try {
    const found = await industryCharacters();
    return { jobIds: found?.jobIds ?? [], corpIds: found?.corpIds ?? [] };
  } catch (err) {
    unstable_rethrow(err);
    console.error('[industry/industry-characters] failed to resolve linked characters', err);
    return { jobIds: [], corpIds: [] };
  }
}
