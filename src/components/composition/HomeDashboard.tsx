import { HomeFeatureCards } from '@/components/composition/HomeFeatureCards';
import { HomeHero } from '@/components/composition/HomeHero';
import { HomeLeftColumn } from '@/components/composition/HomeLeftColumn';
import { HomeLiveStats } from '@/components/composition/HomeLiveStats';
import { HomeNewsCard } from '@/components/composition/HomeNewsCard';

/**
 * The redesigned home. A hero band leads with the anonymous pitch (or the
 * signed-in roster) beside the live-data panel — the "this sits on a living
 * dataset" hook — then the shared tool grid and EVE news below, full width.
 *
 * Auth boundary is unchanged: HomeLeftColumn is the ONLY auth-conditional region
 * (anon hero server-rendered into the static shell, swapped to the roster
 * client-side). Everything else — the live-data panel, tools, news — is identical
 * for every visitor and built from cached accessors, so it prerenders statically.
 * `items-start` keeps the panel top-aligned whether the left is the short hero or
 * the taller roster, decoupling the two column heights.
 */
export function HomeDashboard() {
  return (
    <div className="flex flex-col gap-14">
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(320px,400px)] gap-x-12 gap-y-10 items-start">
        <HomeLeftColumn anonHero={<HomeHero />} />
        <HomeLiveStats />
      </section>
      <HomeFeatureCards />
      <HomeNewsCard />
    </div>
  );
}
