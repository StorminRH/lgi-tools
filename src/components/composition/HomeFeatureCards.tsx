import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { SectionLabel } from '@/components/ui/section-label';

/**
 * The shared tool grid — identical for anonymous and signed-in visitors. The
 * card-glow + bob hover (reduced-motion gated in globals.css) and the
 * arbitrary-value grid template use classes, not inline `style` (house style).
 */
export function HomeFeatureCards() {
  return (
    <section>
      <SectionLabel className="mb-4">Tools</SectionLabel>
      {/* Tailwind arbitrary-value class, not an inline `style` prop — house
       * style keeps the column template in a class so it renders server-side,
       * not just after hydration. */}
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        <Card
          hover
          className="hover-bob group flex"
        >
        <Link
          href="/sites"
          className="flex flex-1 flex-col gap-3 p-5 no-underline"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="font-display font-bold text-h3 tracking-[0.01em] leading-[1.15] text-name">
              Wormhole Sites
            </div>
          </div>
          <p className="flex-1 font-body text-body leading-[1.65] text-text">
            Browse wormhole anomalies and signatures by class, site type, and ISK
            value. Live Jita prices on ore and gas resources.
          </p>
          <div className="flex items-center justify-between pt-[13px] border-t border-border-soft">
            <div className="flex items-center gap-1">
              <Pill tone="red-soft">Combat</Pill>
              <Pill tone="teal">Gas</Pill>
              <Pill tone="yellow">Ore</Pill>
            </div>
            <span className="font-mono text-label tracking-ui text-isk whitespace-nowrap transition-transform group-hover:translate-x-[2px]">
              open →
            </span>
          </div>
        </Link>
        </Card>

        <Card hover className="hover-bob group flex">
        <Link
          href="/industry"
          className="flex flex-1 flex-col gap-3 p-5 no-underline"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="font-display font-bold text-h3 tracking-[0.01em] leading-[1.15] text-name">
              Industry Planner
            </div>
          </div>
          <p className="flex-1 font-body text-body leading-[1.65] text-text">
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
            <span className="font-mono text-label tracking-ui text-isk whitespace-nowrap transition-transform group-hover:translate-x-[2px]">
              open →
            </span>
          </div>
        </Link>
        </Card>
      </div>
    </section>
  );
}
