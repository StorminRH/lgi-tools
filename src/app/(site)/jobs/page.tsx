import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { CharacterPanelSkeleton } from '@/components/composition/CharacterPanelSkeleton';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { auth } from '@/composition/auth';
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

async function JobsContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/?auth_error=login_required');
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
            callbackURL="/jobs"
          />
        }
      />
    </div>
  );
}

function JobsLoading() {
  return (
    <div className="flex w-full flex-col gap-10">
      <CharacterPanelSkeleton label="Loading personal jobs" />
      <CharacterPanelSkeleton rows={1} label="Loading corporation jobs" />
    </div>
  );
}

export default function JobsPage() {
  return (
    <PageShell mode="reading">
      <div className="flex w-full flex-col items-center pb-20">
        <PageHead
          crumb="jobs"
          title="Industry Jobs"
          subtitle="Live job board for every linked character · flips to ready on schedule"
        />
        <Suspense fallback={<JobsLoading />}>
          <JobsContent />
        </Suspense>
      </div>
    </PageShell>
  );
}
