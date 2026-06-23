import { HomeLoginCta } from '@/components/HomeLoginCta';

// The anonymous landing pitch: the bracket-stamp wordmark, one factual line of
// what the site is, and the EVE-login CTA. Rendered on the server and handed to
// HomeLeftColumn so it lands in the static prerender (crawlable, no flash for
// signed-out visitors). Anon-only — the logo already lives in the nav for
// signed-in users, so they never see this.
export function HomeHero() {
  return (
    <div className="flex flex-col gap-6 pt-2">
      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-section px-3 py-1 font-mono text-caption uppercase tracking-[0.14em] text-muted">
        <span className="size-[6px] rounded-full bg-isk" />
        First-party · independent
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="hero-wordmark font-jb font-extrabold text-[clamp(44px,6.5vw,68px)] leading-none tracking-[-0.02em] uppercase text-name">
          <span className="text-isk mr-[0.18em]">[</span>
          Lo-Gang
          <span className="text-isk ml-[0.18em]">]</span>
        </h1>
        <div className="font-jb font-normal text-[clamp(14px,2vw,20px)] tracking-[0.28em] uppercase leading-none">
          <span className="text-muted">Industries</span>
          <span className="text-isk tracking-normal">.</span>
          <span className="text-isk">tools</span>
        </div>
      </div>
      <p className="body-copy text-[15px] text-text leading-[1.7] max-w-[440px]">
        First-party Eve Online tools for wormhole and industry pilots: a searchable
        wormhole site database with live Jita loot prices, and a manufacturing
        profitability planner.
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
        <HomeLoginCta />
        <a
          href="/sites"
          className="font-mono text-[13px] tracking-[0.02em] text-muted hover:text-isk"
        >
          Browse sites →
        </a>
      </div>
    </div>
  );
}
