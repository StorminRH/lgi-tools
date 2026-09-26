import { HomeFeatureCards } from '@/components/composition/HomeFeatureCards';
import { HomeHero } from '@/components/composition/HomeHero';
import { HomeLeftColumn } from '@/components/composition/HomeLeftColumn';
import { HomeLiveStats } from '@/components/composition/HomeLiveStats';
import { HomeNewsCard } from '@/components/composition/HomeNewsCard';

export function HomeDashboard() {
  return (
    <div className="flex flex-col gap-16">
      <HomeLeftColumn anonHero={<HomeHero />} signedInHero={<HomeHero pitch={false} />} />
      <HomeLiveStats />
      <HomeFeatureCards />
      <HomeNewsCard />
    </div>
  );
}
