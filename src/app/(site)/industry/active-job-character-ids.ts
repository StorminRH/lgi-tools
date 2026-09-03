import { BetterAuthError } from 'better-auth';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { cache } from 'react';
import { auth } from '@/platform/auth/auth';
import { type LinkedCharacter, listLinkedCharacters } from '@/platform/auth/linked-characters';
import { deriveCharacterHealth } from '@/platform/auth/scope-health';
import { canSyncCorpIndustryJobs } from '@/features/industry-jobs/corp-sync-eligibility';
import { canSyncIndustryJobs } from '@/features/industry-jobs/sync-eligibility';
import { readEnv } from '@/lib/env';

function authEnvConfigured(): boolean {
  return Boolean(readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET'));
}

const linkedJobCharacters = cache(async (): Promise<LinkedCharacter[]> => {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return [];
    return await listLinkedCharacters(session.user.id);
  } catch (err) {

    unstable_rethrow(err);

    if (err instanceof BetterAuthError && !authEnvConfigured()) return [];

    console.error(
      '[industry/active-job-character-ids] failed to resolve linked characters',
      err,
    );
    return [];
  }
});

function missingScopesOf(character: LinkedCharacter): string[] {
  return deriveCharacterHealth({
    scope: character.scope,
    hasRefreshToken: character.hasRefreshToken,
  }).missingScopes;
}

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

export interface CorpJobsAccess {
  eligibleCharacterIds: number[];
  hasLinkedCharacters: boolean;
}

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
