import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { SectionLabel } from '@/components/ui/section-label';
import { ATLAS_TAGLINE } from '@/features/maps/atlas-copy';

// Decorative, data-free previews: each tile hints at what the tool looks like
// without quoting numbers the page cannot stand behind.
const SITE_ROWS = [
  { cls: 'C5', text: 'text-wh-c5', bar: 'w-[78%]' },
  { cls: 'C6', text: 'text-wh-c6', bar: 'w-[70%]' },
  { cls: 'C3', text: 'text-wh-c3', bar: 'w-[46%]' },
  { cls: 'C4', text: 'text-wh-c4', bar: 'w-[34%]' },
] as const;

function SitesPreview() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 px-5">
      {SITE_ROWS.map((row) => (
        <div
          key={row.cls}
          className="home-preview-row grid grid-cols-[34px_1fr] items-center gap-3 rounded-ctl border border-border-soft bg-row-hover px-2.5 py-2"
        >
          <span className={`rounded-ctl bg-row-on py-0.5 text-center font-data text-micro font-bold ${row.text}`}>
            {row.cls}
          </span>
          <span className="h-1.5 rounded-full bg-row-on">
            <span className={`block h-full rounded-full bg-brand-gradient opacity-70 ${row.bar}`} />
          </span>
        </div>
      ))}
    </div>
  );
}

function IndustryPreview() {
  return (
    <svg viewBox="0 0 360 196" preserveAspectRatio="none" className="size-full" aria-hidden="true">
      <defs>
        <linearGradient id="home-industry-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-isk)" stopOpacity="0.25" />
          <stop offset="1" stopColor="var(--color-isk)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="stroke-border-soft">
        <line x1="0" x2="360" y1="70" y2="70" />
        <line x1="0" x2="360" y1="115" y2="115" />
        <line x1="0" x2="360" y1="160" y2="160" />
      </g>
      <path
        d="M0 150 C30 146 50 132 80 136 S130 110 160 116 S210 86 240 92 S300 60 330 64 L360 58 L360 196 L0 196Z"
        fill="url(#home-industry-fill)"
      />
      <path
        className="home-preview-draw stroke-isk"
        d="M0 150 C30 146 50 132 80 136 S130 110 160 116 S210 86 240 92 S300 60 330 64 L360 58"
        fill="none"
        strokeWidth="2"
      />
      <path
        className="stroke-evb"
        d="M0 170 C40 168 70 160 110 164 S180 150 220 152 S300 140 360 138"
        fill="none"
        strokeWidth="1.5"
        strokeDasharray="3 4"
      />
    </svg>
  );
}

const CHAIN_NODES = [
  { x: 70, y: 98, r: 16, label: 'C5', text: 'fill-wh-c5', home: true },
  { x: 150, y: 54, r: 13, label: 'C3', text: 'fill-wh-c3' },
  { x: 150, y: 142, r: 13, label: 'HS', text: 'fill-sec-10' },
  { x: 240, y: 70, r: 13, label: 'C2', text: 'fill-wh-c2' },
  { x: 240, y: 142, r: 13, label: 'NS', text: 'fill-sec-null' },
  { x: 310, y: 40, r: 11, label: 'C6', text: 'fill-wh-c6' },
  { x: 310, y: 110, r: 11, label: 'C1', text: 'fill-wh-c1' },
] as const;

const CHAIN_EDGES = [
  { d: 'M70 98 L150 54', tone: 'stroke-isk' },
  { d: 'M70 98 L150 142', tone: 'stroke-wh-c3' },
  { d: 'M150 54 L240 70', tone: 'stroke-isk' },
  { d: 'M150 142 L240 142', tone: 'stroke-tone-red' },
  { d: 'M240 70 L310 40', tone: 'stroke-tone-purple' },
  { d: 'M240 70 L310 110', tone: 'stroke-isk' },
] as const;

function AtlasPreview() {
  return (
    <svg viewBox="0 0 360 196" className="size-full" aria-hidden="true">
      {CHAIN_EDGES.map((edge) => (
        <path key={edge.d} className={`home-preview-flow opacity-70 ${edge.tone}`} d={edge.d} fill="none" strokeWidth="1.5" />
      ))}
      <circle className="home-preview-pulse stroke-isk" cx="70" cy="98" r="16" fill="none" />
      {CHAIN_NODES.map((node) => (
        <g key={node.label} className="home-preview-node">
          <circle
            cx={node.x}
            cy={node.y}
            r={node.r}
            className={`fill-section ${'home' in node ? 'stroke-isk' : 'stroke-border-active'}`}
          />
          <text
            x={node.x}
            y={node.y + 3}
            textAnchor="middle"
            className={`font-data text-micro font-bold ${node.text}`}
          >
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function FeatureCard({
  href,
  title,
  description,
  pills,
  preview,
}: {
  href: string;
  title: string;
  description: string;
  pills: ReactNode;
  preview: ReactNode;
}) {
  return (
    <Card hover className="edge-glow group flex rounded-panel">
      <Link href={href} className="flex flex-1 flex-col no-underline">
        <div className="home-preview relative h-[196px] overflow-hidden rounded-t-panel border-b border-border">
          {preview}
        </div>
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="font-display font-bold text-h2 tracking-optical leading-[1.05] text-name">
            {title}
          </div>
          <p className="flex-1 text-body leading-[1.65] text-text">{description}</p>
          <div className="flex items-center justify-between pt-[13px] border-t border-border-soft">
            <div className="flex items-center gap-1">{pills}</div>
            <span className="text-label tracking-copy text-isk whitespace-nowrap transition-transform group-hover:translate-x-[3px]">
              open →
            </span>
          </div>
        </div>
      </Link>
    </Card>
  );
}

export function HomeFeatureCards() {
  return (
    <section className="reveal reveal-5">
      <SectionLabel className="mb-cluster">Tools</SectionLabel>
      <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        <FeatureCard
          href="/sites"
          title="Wormhole Sites"
          description="Browse wormhole anomalies and signatures by class, site type, and ISK value. Live Jita prices on ore and gas resources."
          preview={<SitesPreview />}
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
          preview={<IndustryPreview />}
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
          description={ATLAS_TAGLINE}
          preview={<AtlasPreview />}
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
