import { BetterAuthError } from 'better-auth';
import { cacheLife } from 'next/cache';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { cache } from 'react';
import { auth } from '@/composition/auth';
import { type LinkedCharacter, listLinkedCharacters } from '@/platform/auth/linked-characters';
import { type PanelCharacter, toPanelCharacter } from '@/platform/auth/panel-character';
import { scopeHolderOf } from '@/platform/auth/scope-health';
import { canSyncCorpIndustryJobs } from '@/features/industry-jobs/corp-sync-eligibility';
import { canSyncIndustryJobs } from '@/features/industry-jobs/sync-eligibility';
import { canSyncSkillQueue } from '@/features/skill-queue/sync-eligibility';
import { readAuthSecret } from '@/lib/env';
import type { ScopeEligibility } from '@/lib/scope-eligibility';
import { readOr } from '../read-or';

export interface IndustryCharacters {
  /** Every linked character, as the job boards list them. */
  characters: PanelCharacter[];
  /** The characters whose personal jobs can sync. */
  jobIds: number[];
  /** The characters that can read their corporation's jobs. */
  corpIds: number[];
  /** The characters whose skills can sync, so their slot levels are worth waiting for. */
  skillIds: number[];
}

function eligibleIds(linked: readonly LinkedCharacter[], canSync: ScopeEligibility): number[] {
  return linked.filter((character) => canSync(scopeHolderOf(character))).map((character) => character.characterId);
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
    skillIds: eligibleIds(linked, canSyncSkillQueue),
  };
}

/** The signed-in account's industry characters; null when signed out, or when auth is not set up locally. */
export const industryCharacters = cache(async (): Promise<IndustryCharacters | null> => {
  try {
    return await readIndustryCharacters();
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof BetterAuthError && !readAuthSecret()) return null;
    throw err;
  }
});

/** The ids the Profiles section's job and slot feeds read. A failed read gives none instead of failing the section. */
export function jobCharacterIds(): Promise<Pick<IndustryCharacters, 'jobIds' | 'corpIds' | 'skillIds'>> {
  return readOr(
    '[industry/industry-characters] failed to resolve linked characters',
    async () => {
      const found = await industryCharacters();
      return { jobIds: found?.jobIds ?? [], corpIds: found?.corpIds ?? [], skillIds: found?.skillIds ?? [] };
    },
    { jobIds: [], corpIds: [], skillIds: [] },
  );
}
