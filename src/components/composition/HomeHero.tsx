import { HeroBanner } from '@/components/composition/HeroBanner';
import { HomeLoginCta } from '@/components/composition/HomeLoginCta';

/**
 * The anonymous landing pitch: the bracket-stamp wordmark banner, one factual
 * line of what the site is, and the EVE-login CTA. Rendered on the server and
 * handed to HomeLeftColumn so it lands in the static prerender (crawlable, no
 * flash for signed-out visitors). Anon-only — a signed-in visitor sees the same
 * HeroBanner above their character roster instead (HomeLeftColumn), without the
 * pitch line or the login button.
 */
export function HomeHero() {
  return (
    <div className="flex flex-col gap-6 pt-2">
      <HeroBanner />
      <p className="body-copy text-lead text-text leading-[1.7] max-w-[440px]">
        Eve Online tools for wormhole and industry pilots: a searchable wormhole
        site database with live Jita loot prices, and a manufacturing
        profitability planner.
      </p>
      <div className="pt-1">
        <HomeLoginCta />
      </div>
    </div>
  );
}
