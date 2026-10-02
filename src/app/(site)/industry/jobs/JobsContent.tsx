import { cookies, headers } from 'next/headers';
import { CharacterPanelSkeleton } from '@/components/composition/CharacterPanelSkeleton';
import { auth } from '@/composition/auth';
import { EveSignInButton } from '@/components/composition/account/LoginButton';
import { Card } from '@/components/ui/card';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { toPanelCharacter } from '@/platform/auth/panel-character';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { deriveCharacterHealth } from '@/platform/auth/scope-health';
import { CorpJobsBoard } from '@/features/industry-jobs/components/CorpJobsBoard';
import { IndustryJobsPanel } from '@/features/industry-jobs/components/IndustryJobsPanel';
import { canSyncCorpIndustryJobs } from '@/features/industry-jobs/corp-sync-eligibility';
import { jobsPageSettings } from '@/features/industry-jobs/page-settings';
import { canSyncIndustryJobs } from '@/features/industry-jobs/sync-eligibility';
import { cookieNameFor, readPreferenceCookieValue, stripDimmedDef } from '@/lib/preferences';

export async function JobsContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return (
      <Card>
        <div className="flex flex-col items-start gap-4 px-5 py-5">
          <p className="text-ui text-muted">Sign in with EVE to see your active industry jobs.</p>
          <EveSignInButton callbackURL="/industry/jobs" />
        </div>
      </Card>
    );
  }

  const characters = await listLinkedCharacters(session.user.id);
  const corpEligibleCharacterIds = characters
    .filter((character) =>
      canSyncCorpIndustryJobs({
        hasRefreshToken: character.hasRefreshToken,
        missingScopes: deriveCharacterHealth({
          scope: character.scope,
          hasRefreshToken: character.hasRefreshToken,
        }).missingScopes,
      }),
    )
    .map((character) => character.characterId);

  const stripDef = stripDimmedDef(jobsPageSettings.strip.surfaceId);
  const initialDimmed = readPreferenceCookieValue(
    (await cookies()).get(cookieNameFor(stripDef))?.value,
    stripDef,
  );

  return (
    <div className="flex w-full flex-col gap-10">
      <IndustryJobsPanel
        characters={characters.map((character) => toPanelCharacter(character, canSyncIndustryJobs))}
        strip={jobsPageSettings.strip}
        initialDimmed={initialDimmed}
      />
      <CorpJobsBoard
        eligibleCharacterIds={corpEligibleCharacterIds}
        hasLinkedCharacters={characters.length > 0}
        reconnectAction={
          <LinkCharacterButton
            label="Grant corp jobs access"
            emphasis="reconnect"
            callbackURL="/industry/jobs"
          />
        }
      />
    </div>
  );
}

export function JobsLoading() {
  return (
    <div className="flex w-full flex-col gap-10">
      <CharacterPanelSkeleton label="Loading personal jobs" />
      <CharacterPanelSkeleton rows={1} label="Loading corporation jobs" />
    </div>
  );
}
