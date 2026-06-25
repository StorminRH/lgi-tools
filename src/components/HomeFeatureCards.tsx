import Link from 'next/link';
import { Pill } from '@/components/ui/pill';
import { SectionLabel } from '@/components/ui/section-label';

// The shared tool grid — identical for anonymous and signed-in visitors. The
// card-glow + bob hover (reduced-motion gated in globals.css) and the
// arbitrary-value grid template are CSP-clean (no inline `style`).
export function HomeFeatureCards() {
  return (
    <section>
      <SectionLabel className="mb-4">Tools</SectionLabel>
      {/* Tailwind arbitrary-value class, not an inline `style` prop — production
       * CSP is `style-src 'self'` (no nonce, no unsafe-inline), which would drop
       * a `style="..."` attribute, leaving the grid with no column template
       * until hydration. */}
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        <Link
          href="/sites"
          className="tool-tile tool-tile-live hover-bob no-underline group"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="font-display font-bold text-title-sm tracking-[0.01em] leading-[1.15] text-name">
              Wormhole Sites
            </div>
          </div>
          <p className="body-copy text-[13px] text-text leading-[1.65] flex-1">
            Browse wormhole anomalies and signatures by class, site type, and ISK
            value. Live Jita prices on ore and gas resources.
          </p>
          <div className="flex items-center justify-between pt-[13px] border-t border-border-soft">
            <div className="flex items-center gap-1">
              <Pill tone="red-soft">Combat</Pill>
              <Pill tone="teal">Gas</Pill>
              <Pill tone="yellow">Ore</Pill>
            </div>
            <span className="font-mono text-caption tracking-[0.06em] text-isk whitespace-nowrap transition-transform group-hover:translate-x-[2px]">
              open →
            </span>
          </div>
        </Link>

        <Link
          href="/industry"
          className="tool-tile tool-tile-live hover-bob no-underline group"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="font-display font-bold text-title-sm tracking-[0.01em] leading-[1.15] text-name">
              Industry Planner
            </div>
          </div>
          <p className="body-copy text-[13px] text-text leading-[1.65] flex-1">
            Manufacturing profitability for blueprints and reactions — build cost,
            margin, and price confidence at live Jita rates.
          </p>
          <div className="flex items-center justify-between pt-[13px] border-t border-border-soft">
            <div className="flex items-center gap-1">
              <Pill tone="neutral">T1</Pill>
              <Pill tone="blue">T2</Pill>
              <Pill tone="purple">T3</Pill>
              <Pill tone="teal">Reactions</Pill>
            </div>
            <span className="font-mono text-caption tracking-[0.06em] text-isk whitespace-nowrap transition-transform group-hover:translate-x-[2px]">
              open →
            </span>
          </div>
        </Link>
      </div>
    </section>
  );
}
