import { HomeFeatureCards } from '@/components/composition/HomeFeatureCards';
import { HomeHero } from '@/components/composition/HomeHero';
import { HomeLeftColumn } from '@/components/composition/HomeLeftColumn';
import { HomeLiveStats } from '@/components/composition/HomeLiveStats';
import { HomeNewsCard } from '@/components/composition/HomeNewsCard';

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
