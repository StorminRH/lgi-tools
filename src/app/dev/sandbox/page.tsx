import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSession, isAdmin } from '@/features/auth/session';
import { readEnv } from '@/lib/env';
import { SandboxHeader } from './_shared/sandbox-ui';

const GALLERIES = [
  {
    href: '/dev/sandbox/trees',
    title: 'Build-tree displays',
    count: '5 variants',
    blurb: 'Five distinct ways to present the same blueprint build chain — indented outline, nested cards, SVG flow connectors, radial depth, and a density-toggle table.',
  },
  {
    href: '/dev/sandbox/prices',
    title: 'Price-update animations',
    count: '10 variants',
    blurb: 'Ten transitions for the hero ISK figure going from last-known to confirmed-live. Auto-loops, or trigger each one individually.',
  },
  {
    href: '/dev/sandbox/cards',
    title: 'Card designs',
    count: '6 variants',
    blurb: 'The home/sites card explored for depth and polish — elevation, bevel, hover glow, gradient sheen, and a cursor-tracking aurora.',
  },
];

async function SandboxIndex() {
  // Read the session unconditionally so the route keeps a request-time dynamic
  // hole in BOTH the production and preview builds — the build asserts one
  // render-mode classification (`partial`) for both targets, so the read must
  // happen the same way in each. The gate only *acts* on production: previews
  // stay open so the mockups are viewable where EVE login isn't available.
  const session = await getSession();
  if (readEnv('VERCEL_ENV') === 'production' && !isAdmin(session)) {
    redirect('/?auth_error=admin_required');
  }

  return (
    <>
      <SandboxHeader
        title="UX Exploration Sandbox"
        subtitle="Dev-only · clickable mockups · pick favourites to port to production"
      />

      <div className="w-full max-w-[1100px] grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {GALLERIES.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className="sbx-card-glow no-underline border border-border bg-section rounded-[4px] p-5 flex flex-col gap-2.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display font-bold text-[15px] text-name tracking-[0.04em]">
                {g.title}
              </span>
              <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-isk whitespace-nowrap">
                {g.count}
              </span>
            </div>
            <p className="font-mono text-[11px] leading-[1.6] text-muted">{g.blurb}</p>
          </Link>
        ))}
      </div>

      <Link
        href="/dev/sandbox/industry"
        className="sbx-card-glow no-underline w-full max-w-[1100px] mt-4 border border-border bg-section rounded-[4px] p-5 flex items-baseline justify-between gap-3"
      >
        <span className="flex flex-col gap-1.5">
          <span className="font-display font-bold text-[15px] text-name tracking-[0.04em]">
            Mockup planner page
          </span>
          <span className="font-mono text-[11px] leading-[1.6] text-muted">
            The hybrid build view (consolidated tier columns → click a part to zoom into its flow) shown in
            a full planner-page layout on real Rifter / Loki / Archon builds.
          </span>
        </span>
        <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-isk whitespace-nowrap">
          In context ▸
        </span>
      </Link>

      <p className="w-full max-w-[1100px] mt-8 text-[10px] leading-[1.6] text-muted">
        Every variant is fed the same sample data (a Wolf assault-frigate build).
        These are evaluation mockups — some would need accessibility and
        responsive hardening if chosen. Notes on each call that out where it
        applies.
      </p>
    </>
  );
}

function SandboxLoading() {
  return <span className="text-[10px] tracking-[0.12em] uppercase text-muted">Loading…</span>;
}

// Admin-gated on production only: the session read is a request-time dynamic
// hole, so the page container prerenders as a static shell (route classified
// `partial`). On preview/dev the gate stays open — EVE login isn't available
// there, so the mockups remain viewable. The gallery leaf pages carry no gate.
export default function SandboxIndexPage() {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20">
      <Suspense fallback={<SandboxLoading />}>
        <SandboxIndex />
      </Suspense>
    </div>
  );
}
