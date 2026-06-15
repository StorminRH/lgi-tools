import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHead } from '@/components/ui/page-head';
import { SectionLabel } from '@/components/ui/section-label';
import { SITE_URL } from '@/config/site-url';
import { IndustryRow } from '@/features/industry-planner/components/IndustryRow';
import { IndustryTypedHint } from '@/features/industry-planner/components/IndustryTypedHint';
import { RecentlyViewed } from '@/features/industry-planner/components/RecentlyViewed';
import { getBlueprintStructure } from '@/features/industry-planner/queries';
import { IndustryActiveJobs } from '@/features/industry-jobs/components/IndustryActiveJobs';
import { IndustrySlotMeta } from '@/features/industry-jobs/components/IndustrySlotMeta';
import { activeJobCharacterIds } from './active-job-character-ids';

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
// with no ids; the client island then shows the sign-in prompt.
async function ActiveJobsSection() {
  return <IndustryActiveJobs characterIds={await activeJobCharacterIds()} />;
}

// Static shell — header, typed hint, and the recents/favorites scaffold
// prerender; the recently-viewed list hydrates from localStorage, the slot
// counts + active jobs stream over Convex, and the active-jobs character list
// is the one request-time read (a <Suspense> hole).
export default function IndustryDashboardPage() {
  return (
    <div className="w-full">
      <PageHead crumb="industry" title="Industry" meta={<IndustrySlotMeta />} />

      <div className="w-full max-w-[1080px] mx-auto px-7 pb-16 flex flex-col gap-9">
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
              <p className="text-[10px] tracking-[0.12em] uppercase text-muted">Loading…</p>
            </section>
          }
        >
          <ActiveJobsSection />
        </Suspense>
      </div>
    </div>
  );
}
