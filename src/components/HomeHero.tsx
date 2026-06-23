import { HomeLoginCta } from '@/components/HomeLoginCta';

// The anonymous landing pitch: the bracket-stamp wordmark, one factual line of
// what the site is, and the EVE-login CTA. Rendered on the server and handed to
// HomeLeftColumn so it lands in the static prerender (crawlable, no flash for
// signed-out visitors). Anon-only — the logo already lives in the nav for
// signed-in users, so they never see this.
export function HomeHero() {
  return (
    <div className="flex flex-col gap-5 pt-2">
      <div className="flex flex-col gap-1.5">
        <h1 className="hero-wordmark font-jb font-extrabold text-[clamp(40px,6vw,60px)] leading-none tracking-[-0.02em] uppercase text-name">
          <span className="text-isk mr-[0.2em]">[</span>
          Lo-Gang
          <span className="text-isk ml-[0.2em]">]</span>
        </h1>
        <div className="font-jb font-normal text-[clamp(13px,2vw,19px)] tracking-[0.28em] uppercase leading-none">
          <span className="text-muted">Industries</span>
          <span className="text-isk tracking-normal">.</span>
          <span className="text-isk">tools</span>
        </div>
      </div>
      <p className="body-copy text-[13.5px] text-text leading-[1.7] max-w-[340px]">
        First-party Eve Online tools for wormhole and industry pilots: a wormhole
        site database with live Jita loot prices, and a manufacturing
        profitability planner.
      </p>
      <HomeLoginCta />
    </div>
  );
}
