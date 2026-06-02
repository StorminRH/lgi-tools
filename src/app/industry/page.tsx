import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { SITE_URL } from '@/config/site-url';
import { BlueprintRow } from '@/features/industry-planner/components/BlueprintRow';
import { RecentlyViewed } from '@/features/industry-planner/components/RecentlyViewed';
import { SearchHero } from '@/features/industry-planner/components/SearchHero';
import { getBlueprintStructure } from '@/features/industry-planner/queries';

export const metadata: Metadata = {
  title: 'Industry Planner',
  description:
    'Your Eve Online manufacturing dashboard — search any blueprint to see its build cost, profit margin, and price confidence at live Jita rates, and jump back to the builds you recently viewed.',
  alternates: { canonical: `${SITE_URL}/industry` },
  openGraph: {
    title: 'Industry Planner — LGI.tools',
    description:
      'Search any Eve Online blueprint to plan its build — cost, profit margin, and price confidence at live Jita rates.',
    url: `${SITE_URL}/industry`,
    type: 'website',
    images: ['/logo.png'],
  },
};

// A frigate, a battlecruiser, and a capital — a quick spread of build depth,
// shown as sample "favorites" until per-user favorites land. These are the
// resolver's reference blueprints (REFERENCE_BLUEPRINT_TYPE_IDS).
const SAMPLE_FAVORITE_IDS = [691, 24699, 23758];

// A dashboard panel: a titled card with an optional header hint.
function DashboardSection({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="w-full max-w-[1100px] mb-5">
      <SectionHeader label={label} hint={hint} />
      {children}
    </Card>
  );
}

// Sample favorites — real reference blueprints rendered dimmed, as a preview of
// the per-user favorites feature. Cached structure reads (no price dependency),
// so this prerenders into the static shell.
async function FavoritesSection() {
  const structures = (
    await Promise.all(SAMPLE_FAVORITE_IDS.map((id) => getBlueprintStructure(id)))
  ).filter((s) => s !== null);

  return (
    <DashboardSection label="Favorites" hint="Sign in to save — coming soon">
      {structures.length === 0 ? (
        <EmptyState>No favorites yet.</EmptyState>
      ) : (
        structures.map((s) => (
          <BlueprintRow
            key={s.blueprintTypeId}
            typeId={s.product.typeId}
            name={s.product.name}
            href={`/industry/${s.blueprintTypeId}`}
            trailing="sample"
            dimmed
          />
        ))
      )}
    </DashboardSection>
  );
}

// Static shell — title + the dashboard panels. No searchParams or cookies are
// read, and every server read here is cached, so the page prerenders fully
// static; the recently-viewed panel hydrates client-side from localStorage.
export default function IndustryDashboardPage() {
  return (
    <div className="flex flex-col items-center px-4 pt-12 pb-20 sm:px-6">
      <header className="w-full max-w-[1100px] mb-6 pb-4 border-b border-border-soft">
        <h1 className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
          Industry Planner
        </h1>
        <p className="text-[10px] text-muted tracking-[0.12em] uppercase">
          Your manufacturing dashboard
        </p>
      </header>

      <SearchHero />

      <FavoritesSection />

      <DashboardSection label="Recently viewed">
        <RecentlyViewed />
      </DashboardSection>

      <DashboardSection label="Active builds" hint="Coming soon">
        <EmptyState>
          No active builds — start one from any blueprint to track it here.
        </EmptyState>
      </DashboardSection>
    </div>
  );
}
