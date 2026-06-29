import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionLabel } from '@/components/ui/section-label';
import { SITE_URL } from '@/config/site-url';
import { IndustryRow } from '@/features/industry-planner/components/IndustryRow';
import { IndustryTypedHint } from '@/features/industry-planner/components/IndustryTypedHint';
import { RecentlyViewed } from '@/features/industry-planner/components/RecentlyViewed';
import { getBlueprintStructure } from '@/features/industry-planner/queries';
import { LinkCharacterButton } from '@/features/auth/components/LinkCharacterButton';
import { CorpJobsBoard } from '@/features/industry-jobs/components/CorpJobsBoard';
import { IndustryActiveJobs } from '@/features/industry-jobs/components/IndustryActiveJobs';
import { IndustrySlotMeta } from '@/features/industry-jobs/components/IndustrySlotMeta';
import { activeJobCharacterIds, corpJobsAccess } from './active-job-character-ids';

export const metadata: Metadata = {
  title: 'Industry Planner',
  description:
    'Your Eve Online manufacturing dashboard — search any blueprint to see its build cost, profit margin, and price confidence at live Jita rates, jump back to builds you recently viewed, and watch your live industry jobs.',
  alternates: { canonical: '/industry' },
  openGraph: {
    title: 'Industry Planner — LGI.tools',
    description:
      'Search any Eve Online blueprint to plan its build — cost, profit margin, and price confidence at live Jita rates.',
    url: `${SITE_URL}/industry`,
    type: 'website',
    images: ['/logo.png'],
  },
};

const PANEL = 'border border-border rounded-[5px] bg-section overflow-hidden';

// A frigate, a battlecruiser, and a capital — a quick spread of build depth,
// shown as sample "favorites" until per-user favorites land. These are the
// resolver's reference blueprints.
const SAMPLE_FAVORITE_IDS = [691, 24699, 23758];

// Sample favorites — real reference blueprints, shown as a preview of the
// per-user favorites feature. Cached structure reads (no price dependency), so
// this prerenders into the static shell.
async function FavoritesList() {
  const structures = (
    await Promise.all(SAMPLE_FAVORITE_IDS.map((id) => getBlueprintStructure(id)))
  ).filter((s) => s !== null);

  if (structures.length === 0) return <EmptyState>No favorites yet.</EmptyState>;

  return (
    <>
      {structures.map((s) => (
        <IndustryRow
          key={s.blueprintTypeId}
          name={s.product.name}
          href={`/industry/${s.blueprintTypeId}`}
          fav
        />
      ))}
    </>
  );
}

// Request-time region: reads the session + linked characters so the live
// Active-jobs island knows which characters to keep synced. Signed-out renders
// with no ids; the client island then shows the sign-in prompt. The corp board
// (a separate read of the same linked characters, deduped within the request)
// adds the pilot's corporation jobs beneath the personal board.
async function ActiveJobsSection() {
  const [characterIds, corp] = await Promise.all([activeJobCharacterIds(), corpJobsAccess()]);
  return (
    <div className="flex flex-col gap-9">
      <IndustryActiveJobs characterIds={characterIds} />
      <CorpJobsBoard
        eligibleCharacterIds={corp.eligibleCharacterIds}
        hasLinkedCharacters={corp.hasLinkedCharacters}
        reconnectAction={
          <LinkCharacterButton
            label="Grant corp jobs access"
            emphasis="reconnect"
            callbackURL="/industry"
          />
        }
      />
    </div>
  );
}

// The header's used-slot counts read the same per-character ids the active-jobs
// board does (deduped within the request via activeJobCharacterIds' cache), so the
// header meta is its own small request-time <Suspense> hole feeding the client island.
async function SlotMeta() {
  const characterIds = await activeJobCharacterIds();
  return <IndustrySlotMeta characterIds={characterIds} />;
}

// Static shell — header, typed hint, and the recents/favorites scaffold
// prerender; the recently-viewed list hydrates from localStorage, the slot
// counts + active jobs are fetched client-side from /api/account/industry-jobs (Neon
// stale-gated on-view), and the active-jobs character list is the request-time read
// (a <Suspense> hole, shared by the header meta and the active-jobs section).
export default function IndustryDashboardPage() {
  return (
    <PageShell>
      <PageHead
        crumb="industry"
        title="Industry"
        meta={
          <Suspense fallback={null}>
            <SlotMeta />
          </Suspense>
        }
      />

      <div className="pb-16 flex flex-col gap-9">
        <IndustryTypedHint />

        <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-4">
          <section>
            <SectionLabel className="mb-3">Recents</SectionLabel>
            <div className={PANEL}>
              <RecentlyViewed />
            </div>
          </section>
          <section>
            <SectionLabel
              className="mb-3"
              meta={
                <span className="font-mono text-[10px] tracking-[0.04em] text-muted">
                  sign in to save — soon
                </span>
              }
            >
              Favorites
            </SectionLabel>
            <div className={PANEL}>
              <Suspense fallback={<EmptyState>{' '}</EmptyState>}>
                <FavoritesList />
              </Suspense>
            </div>
          </section>
        </div>

        <Suspense
          fallback={
            <section>
              <SectionLabel className="mb-3">Active jobs</SectionLabel>
              <LoadingLabel />
            </section>
          }
        >
          <ActiveJobsSection />
        </Suspense>
      </div>
    </PageShell>
  );
}
