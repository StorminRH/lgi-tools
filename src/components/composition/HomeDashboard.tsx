import { HomeFeatureCards } from '@/components/composition/HomeFeatureCards';
import { HomeHero } from '@/components/composition/HomeHero';
import { HomeLiveStats } from '@/components/composition/HomeLiveStats';
import { HomeNewsCard } from '@/components/composition/HomeNewsCard';
import { HomeSignedInRoster } from '@/components/composition/HomeSignedInRoster';

export function HomeDashboard() {
  return (
    <div className="flex flex-col gap-16">
      <div className="flex flex-col gap-10">
        <HomeHero />
        <HomeSignedInRoster />
      </div>
      <HomeLiveStats />
      <HomeFeatureCards />
      <HomeNewsCard />
    </div>
  );
}
