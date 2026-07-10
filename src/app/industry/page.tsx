import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionLabel } from '@/components/ui/section-label';
import { SITE_URL } from '@/config/site-url';
import { IndustryTypedHint } from '@/features/industry-planner/components/IndustryTypedHint';
import { LinkCharacterButton } from '@/features/auth/components/LinkCharacterButton';
import { IndustrySlotMeta } from '@/features/industry-jobs/components/IndustrySlotMeta';
import { activeJobCharacterIds, corpJobsAccess } from './active-job-character-ids';
import { PANEL_CLASS } from './dashboard-sections';
import { IndustryDashboardGrid } from './IndustryDashboardGrid';

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

// Request-time region: reads the session + linked characters (both cache()-
// deduped with the header's SlotMeta read) so the client section grid knows
// which characters to keep synced and whether the corp gates apply. Signed-out
// renders with no ids; the grid's sections then settle to their empty states.
async function DashboardSections() {
  const [characterIds, corp] = await Promise.all([activeJobCharacterIds(), corpJobsAccess()]);
  return (
    <IndustryDashboardGrid
      characterIds={characterIds}
      corpEligibleCharacterIds={corp.eligibleCharacterIds}
      hasLinkedCharacters={corp.hasLinkedCharacters}
      reconnectAction={
        <LinkCharacterButton
          label="Grant corp jobs access"
          emphasis="reconnect"
          callbackURL="/industry"
        />
      }
    />
  );
}

// The header's used/total slot readout reads the same per-character ids +
// corp gates the section grid does (both cache()-deduped within the request),
// so the header meta is its own small request-time <Suspense> hole feeding the
// client island.
async function SlotMeta() {
  const [characterIds, corp] = await Promise.all([activeJobCharacterIds(), corpJobsAccess()]);
  return (
    <IndustrySlotMeta
      characterIds={characterIds}
      corpEligibleCharacterIds={corp.eligibleCharacterIds}
    />
  );
}

// The prerendered stand-in for the section grid: the four sections in the
// preferred order, quiet placeholders where the data lands. The client grid
// re-ranks once section data settles (empties sink as slim headers).
function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-4 items-start">
      {(
        [
          ['Recents', 'panel'],
          ['Saved builds', 'panel'],
          ['Active jobs', 'loading'],
          ['Corporation industry jobs', 'loading'],
        ] as const
      ).map(([label, kind]) => (
        <section key={label}>
          <SectionLabel className="mb-3">{label}</SectionLabel>
          {kind === 'panel' ? (
            <div className={PANEL_CLASS}>
              <EmptyState> </EmptyState>
            </div>
          ) : (
            <LoadingLabel label="Loading…" />
          )}
        </section>
      ))}
    </div>
  );
}

// Static shell — header and typed hint prerender, plus the section-grid
// skeleton as the <Suspense> fallback. The session + linked-character read is
// ONE request-time hole feeding the client section grid (IndustryDashboardGrid),
// which owns recents (localStorage), saved builds (/api/account/saved-plans),
// and the personal + corp job boards (the existing Neon stale-gated on-view
// reads) — and ranks populated sections above empty ones.
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

        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardSections />
        </Suspense>
      </div>
    </PageShell>
  );
}
