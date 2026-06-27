import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { auth } from '@/features/auth/auth';
import { LinkCharacterButton } from '@/features/auth/components/LinkCharacterButton';
import { toPanelCharacter } from '@/features/auth/panel-character';
import { listLinkedCharacters } from '@/features/auth/queries';
import { deriveCharacterHealth } from '@/features/auth/scope-health';
import { CorpJobsBoard } from '@/features/industry-jobs/components/CorpJobsBoard';
import { IndustryJobsPanel } from '@/features/industry-jobs/components/IndustryJobsPanel';
import { canSyncCorpIndustryJobs } from '@/features/industry-jobs/corp-sync-eligibility';
import { canSyncIndustryJobs } from '@/features/industry-jobs/sync-eligibility';

async function JobsContent() {
  // Session-gated (any signed-in pilot), the /characters precedent: signed
  // out lands on the homepage with the login notice. The hole reads the
  // session + the linked-character list per request; the job data itself
  // arrives client-side over the Convex websocket.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/?auth_error=login_required');
  }

  const characters = await listLinkedCharacters(session.user.id);
  // Which characters can vend a corp read (scope + token), composed app-side from
  // the auth deriver + the corp scope set (a feature can't import the other's).
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

  return (
    <div className="flex flex-col gap-10">
      <IndustryJobsPanel
        characters={characters.map((character) => toPanelCharacter(character, canSyncIndustryJobs))}
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
    <LoadingLabel />
  );
}

// Live industry jobs across the pilot's linked characters (3.4.8) — the
// second Convex tracker, and the first with a scheduled transition: a job
// flips to ready at its end date with the page open. The page container
// prerenders as the static shell; the session + character-list read is a
// request-time dynamic hole, and the job boards stream in reactively from
// Convex inside the client island.
export default function JobsPage() {
  return (
    <PageShell>
      <div className="flex flex-col items-center pb-20">
        <div className="w-full max-w-[760px]">
          <PageHead
            crumb="jobs"
            title="Industry Jobs"
            subtitle="Live job board for every linked character · flips to ready on schedule"
          />
        </div>
        <div className="w-full max-w-[760px]">
          <Suspense fallback={<JobsLoading />}>
            <JobsContent />
          </Suspense>
        </div>
      </div>
    </PageShell>
  );
}
