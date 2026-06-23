import { HomeFeatureCards } from '@/components/HomeFeatureCards';
import { HomeHero } from '@/components/HomeHero';
import { HomeLeftColumn } from '@/components/HomeLeftColumn';
import { HomeNewsCard } from '@/components/HomeNewsCard';
import { HomeStatsCard } from '@/components/HomeStatsCard';

// The two-column home dashboard. LEFT is the only auth-conditional region (the
// anon hero, server-rendered into the shell, swapped to the signed-in panel
// client-side). RIGHT is the shared scroll column — identical for every visitor,
// never forked by auth — built from cached accessors that prerender statically.
// `items-start` keeps a short left column top-aligned and decouples the column
// heights, so the layout reads right whether the left is the hero or a future
// one-character roster.
export function HomeDashboard() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-x-8 gap-y-10 items-start">
      <HomeLeftColumn anonHero={<HomeHero />} />
      <div className="flex flex-col gap-9 min-w-0">
        <HomeFeatureCards />
        <HomeNewsCard />
        <HomeStatsCard />
      </div>
    </div>
  );
}
