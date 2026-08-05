import { HeroBanner } from '@/components/composition/HeroBanner';

/**
 * The anonymous landing pitch: the bracket-stamp wordmark banner and one factual
 * line of what the site is. Rendered on the server and handed to HomeLeftColumn
 * so it lands in the static prerender (crawlable, no flash for signed-out
 * visitors). Anon-only — a signed-in visitor sees the same HeroBanner above
 * their character roster instead (HomeLeftColumn), without the pitch line.
 * Sign-in lives in the header's official EVE SSO button.
 */
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
