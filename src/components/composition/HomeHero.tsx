import { HeroBanner } from '@/components/composition/HeroBanner';
import { HomeHeroSearch } from '@/components/composition/HomeHeroSearch';

// Decorative orbit rings behind the wordmark. Each ring carries one or two
// "systems" in the wormhole-class colours; the rings counter-rotate slowly.
function HomeOrbits() {
  return (
    <svg className="home-orbits" viewBox="0 0 980 980" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="home-orbit-core" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--color-isk)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--color-isk)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="490" cy="490" r="260" fill="url(#home-orbit-core)" />
      <g className="home-orbit home-orbit-a">
        <circle cx="490" cy="490" r="300" fill="none" className="home-orbit-ring" />
        <circle cx="790" cy="490" r="4" className="fill-isk" />
        <circle cx="790" cy="490" r="10" fill="none" className="home-orbit-halo" />
        <circle cx="232" cy="336" r="2.5" className="fill-wh-c3" />
      </g>
      <g className="home-orbit home-orbit-b">
        <circle cx="490" cy="490" r="380" fill="none" strokeDasharray="2 8" className="home-orbit-ring" />
        <circle cx="110" cy="490" r="3" className="fill-evb-bright" />
        <circle cx="758" cy="758" r="2.5" className="fill-wh-c5" />
      </g>
      <g className="home-orbit home-orbit-c">
        <circle cx="490" cy="490" r="470" fill="none" className="home-orbit-ring home-orbit-ring-faint" />
        <circle cx="490" cy="20" r="3" className="fill-tone-purple" />
      </g>
    </svg>
  );
}

export function HomeHero({ pitch = true }: { pitch?: boolean }) {
  return (
    <section className="home-hero relative isolate flex flex-col items-center gap-7 pt-14 pb-6 text-center">
      <HomeOrbits />
      <HeroBanner />
      {pitch && (
        <p className="reveal reveal-3 max-w-[560px] text-lead leading-[1.7] text-text">
          Eve Online tools for wormhole and industry pilots: a searchable wormhole
          site database with live Jita loot prices, and a manufacturing
          profitability planner.
        </p>
      )}
      <HomeHeroSearch />
    </section>
  );
}
