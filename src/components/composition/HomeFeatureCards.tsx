import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { SectionLabel } from '@/components/ui/section-label';

function FeatureCard({
  href,
  title,
  description,
  pills,
}: {
  href: string;
  title: string;
  description: string;
  pills: ReactNode;
}) {
  return (
    <Card hover className="hover-bob group flex">
      <Link href={href} className="flex flex-1 flex-col gap-3 p-5 no-underline">
        <div className="flex items-start justify-between gap-2">
          <div className="font-display font-bold text-h3 tracking-optical leading-[1.15] text-name">
            {title}
          </div>

        </div>

        <p className="flex-1 text-body leading-[1.65] text-text">{description}</p>

        <div className="flex items-center justify-between pt-[13px] border-t border-border-soft">
          <div className="flex items-center gap-1">{pills}</div>

          <span className="text-label tracking-copy text-isk whitespace-nowrap transition-transform group-hover:translate-x-[2px]">
            open →
          </span>

        </div>

      </Link>

    </Card>

  );
}

export function HomeFeatureCards() {
  return (
    <section>
      <SectionLabel className="mb-cluster">Tools</SectionLabel>
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        <FeatureCard
          href="/sites"
          title="Wormhole Sites"
          description="Browse wormhole anomalies and signatures by class, site type, and ISK value. Live Jita prices on ore and gas resources."
          pills={
            <>
              <Pill tone="red-soft">Combat</Pill>

              <Pill tone="teal">Gas</Pill>

              <Pill tone="yellow">Ore</Pill>

            </>

          }
        />
        <FeatureCard
          href="/industry"
          title="Industry Planner"
          description="Manufacturing profitability for blueprints and reactions — build cost, margin, and price confidence at live Jita rates."
          pills={
            <>
              <Pill tone="neutral">T1</Pill>

              <Pill tone="blue">T2</Pill>

              <Pill tone="purple">T3</Pill>

              <Pill tone="teal">Reactions</Pill>

            </>

          }
        />
        <FeatureCard
          href="/atlas"
          title="Atlas"
          description="Chart wormhole chains, paste scanner results, and share a live map with your corporation."
          pills={
            <>
              <Pill tone="purple">Chain</Pill>

              <Pill tone="teal">Scanner</Pill>

              <Pill tone="green">Live</Pill>

            </>

          }
        />
      </div>

    </section>

  );
}
