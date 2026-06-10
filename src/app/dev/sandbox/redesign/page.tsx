import type { Metadata } from 'next';
import Link from 'next/link';
import { SandboxHeader } from '../_shared/sandbox-ui';

export const metadata: Metadata = { title: 'Site Redesign Mockups (dev)' };

// Index for the site-redesign exploration: two complete candidate themes,
// each applied to the home page and the industry-planner landing page.
// Both carry a redesigned nav (Theme A: animated hamburger panel; Theme B:
// expanding side rail). The production header still renders above each
// mockup — judge everything below it.

const MOCKUPS = [
  {
    href: '/dev/sandbox/redesign/home-a',
    tag: 'Theme A · Home',
    title: 'Phosphor — landing page',
    blurb:
      'Near-black ruled sheet, Geist at a 15px+ base, phosphor-green accent. Depth from four elevation steps and heavy soft shadows. Top bar with a hamburger that morphs to an × and drops an elevated panel.',
  },
  {
    href: '/dev/sandbox/redesign/industry-a',
    tag: 'Theme A · Industry',
    title: 'Phosphor — industry planner',
    blurb:
      'Search-first dashboard: command bar, recent searches with margin chips, and ghosted active-jobs placeholders with progress bars and slot meters. No sample builds.',
  },
  {
    href: '/dev/sandbox/redesign/home-b',
    tag: 'Theme B · Home',
    title: 'Holo Console — landing page',
    blurb:
      'EVE bridge-console: nebula light, glass panels with corner brackets, ice-cyan accent, Chakra Petch display type. Sticky side rail expands from glyphs to labels on hover.',
  },
  {
    href: '/dev/sandbox/redesign/industry-b',
    tag: 'Theme B · Industry',
    title: 'Holo Console — industry planner',
    blurb:
      'Query console with a blinking block cursor, recent queries as holo rows, and active-jobs placeholders as segmented slot meters + dashed ghost jobs. No sample builds.',
  },
];

export default function RedesignIndexPage() {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20">
      <SandboxHeader
        title="Site Redesign Mockups"
        subtitle="Two candidate themes × home + industry landing · new fonts, colors, depth, and nav"
      />

      <div className="w-full max-w-[1100px] grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {MOCKUPS.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="sbx-card-glow no-underline border border-border bg-section rounded-[4px] p-5 flex flex-col gap-2.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display font-bold text-[15px] text-name tracking-[0.04em]">
                {m.title}
              </span>
              <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-isk whitespace-nowrap">
                {m.tag}
              </span>
            </div>
            <p className="font-mono text-[11px] leading-[1.6] text-muted">{m.blurb}</p>
          </Link>
        ))}
      </div>

      <p className="w-full max-w-[1100px] mt-8 text-[10px] leading-[1.6] text-muted">
        Full-page mockups with static mock data — links inside them route to
        the real tools where those exist. The production header still renders
        above each mockup; each theme&apos;s own nav (hamburger panel / side
        rail) is part of the mockup below it. Fonts load only under this route
        group.
      </p>
    </div>
  );
}
