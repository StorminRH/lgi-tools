import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { Suspense } from 'react';
import { CharacterPanelSkeleton } from '@/components/composition/CharacterPanelSkeleton';
import { EveSignInButton } from '@/components/composition/account/LoginButton';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { AccessGate } from '@/components/ui/access-gate';
import { SheetHeading, SheetLayout } from '@/components/ui/sheet-layout';
import { auth } from '@/composition/auth';
import { ActiveJobsBoard } from '@/features/industry-jobs/components/ActiveJobsBoard';
import { canSyncCorpIndustryJobs } from '@/features/industry-jobs/corp-sync-eligibility';
import { jobsPageSettings } from '@/features/industry-jobs/page-settings';
import { canSyncIndustryJobs } from '@/features/industry-jobs/sync-eligibility';
import { cookieNameFor, readPreferenceCookieValue, stripDimmedDef } from '@/lib/preferences';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { toPanelCharacter } from '@/platform/auth/panel-character';
import { deriveCharacterHealth } from '@/platform/auth/scope-health';

export const metadata: Metadata = {
  title: 'Active Jobs — Industry Planner',
  description: 'Live Eve Online industry jobs across your pilots and corporations, with slot usage.',
  alternates: { canonical: '/industry/jobs' },
};

const JOBS_PATH = '/industry/jobs';

function SignedOutJobs() {
  return (
    <SheetLayout
      aside={<SheetHeading title="Active jobs">Live jobs across your pilots and corporations.</SheetHeading>}
    >
      <AccessGate
        blocked
        title="Sign in"
        tone="neutral"
        reason="Sign in with EVE to follow your industry jobs and slot usage live."
        action={<EveSignInButton callbackURL={JOBS_PATH} />}
      >
        {null}
      </AccessGate>
    </SheetLayout>
  );
}

async function JobsContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return <SignedOutJobs />;

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
    <ActiveJobsBoard
      characters={characters.map((character) => toPanelCharacter(character, canSyncIndustryJobs))}
      strip={jobsPageSettings.strip}
      initialDimmed={initialDimmed}
      corpEligibleCharacterIds={corpEligibleCharacterIds}
      reconnectAction={
        <LinkCharacterButton label="Grant corp jobs access" emphasis="reconnect" callbackURL={JOBS_PATH} />
      }
    />
  );
}

function JobsLoading() {
  return (
    <SheetLayout aside={<SheetHeading title="Active jobs" />}>
      <CharacterPanelSkeleton label="Loading personal jobs" />
      <CharacterPanelSkeleton rows={1} label="Loading corporation jobs" />
    </SheetLayout>
  );
}

export default function IndustryJobsPage() {
  return (
    <Suspense fallback={<JobsLoading />}>
      <JobsContent />
    </Suspense>
  );
}
