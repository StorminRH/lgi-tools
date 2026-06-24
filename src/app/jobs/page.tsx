import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageShell } from '@/components/ui/page-shell';
import { auth } from '@/features/auth/auth';
import { toPanelCharacter } from '@/features/auth/panel-character';
import { listLinkedCharacters } from '@/features/auth/queries';
import { IndustryJobsPanel } from '@/features/industry-jobs/components/IndustryJobsPanel';
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
  return (
    <IndustryJobsPanel
      characters={characters.map((character) => toPanelCharacter(character, canSyncIndustryJobs))}
    />
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
      <div className="flex flex-col items-center pt-12 pb-20">
        <header className="w-full max-w-[760px] mb-6 pb-4 border-b border-border-soft">
          <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
            Industry Jobs
          </div>
          <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
            Live job board for every linked character · flips to ready on schedule
          </div>
        </header>
        <div className="w-full max-w-[760px]">
          <Suspense fallback={<JobsLoading />}>
            <JobsContent />
          </Suspense>
        </div>
      </div>
    </PageShell>
  );
}
