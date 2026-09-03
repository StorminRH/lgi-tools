import { HeroBanner } from '@/components/composition/HeroBanner';

export function HomeHero() {
  return (
    <div className="flex flex-col gap-6 pt-2">
      <HeroBanner />
      <p className="max-w-[440px] text-lead leading-[1.7] text-text">
        Eve Online tools for wormhole and industry pilots: a searchable wormhole
        site database with live Jita loot prices, and a manufacturing
        profitability planner.
      </p>
    </div>
  );
}
