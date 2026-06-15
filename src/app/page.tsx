import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { JsonLd } from '@/components/JsonLd';
import { Callout } from '@/components/ui/callout';
import { Pill } from '@/components/ui/pill';
import { SectionLabel } from '@/components/ui/section-label';
import { getFeatureFlags } from '@/config/feature-flags';
import { SITE_URL } from '@/config/site-url';

export const metadata: Metadata = {
  title: {
    absolute: 'Eve Online Wormhole Site Database & Live Jita Loot Prices — LGI.tools',
  },
  description:
    'Browse all 69 Eve Online wormhole sites by class, type, and ISK value, with live Jita prices on ore and gas resources. Free first-party tools for wormhole pilots.',
  // Next normalizes the root canonical to the bare origin (`https://lgi.tools`)
  // under `trailingSlash: false` — Google treats that as identical to
  // `https://lgi.tools/`, the form URL Inspection displays.
  alternates: { canonical: '/' },
};

// WebSite + Organization structured data for the homepage — associates the
// brand, site, and logo for search engines, and anchors future schema by @id.
const HOME_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Lo-Gang Industries',
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'LGI.tools',
      url: SITE_URL,
      description:
        'First-party Eve Online tools for wormhole pilots — a searchable database of wormhole sites with live Jita loot prices.',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  state_mismatch:
    'Sign-in could not be verified. Try clicking "Log in with EVE" again.',
  token_exchange_failed:
    'EVE rejected the sign-in. Wait a moment and try again.',
  db_write_failed:
    'We signed you in but could not save your character record. Try again or report this.',
  admin_required:
    'The admin dashboard is only available to authorized characters.',
};

// The only per-request input on this page is the transient `auth_error` query
// param from a failed OAuth redirect. Isolating it in a Suspense hole lets the
// hero and tool tiles prerender into the static shell.
async function AuthErrorNotice({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawError = params.auth_error;
  const errorKey =
    typeof rawError === 'string' && rawError in AUTH_ERROR_MESSAGES ? rawError : null;
  if (!errorKey) return null;
  return (
    <div className="w-full max-w-[640px] px-6 pt-8">
      <Callout label="Auth">{AUTH_ERROR_MESSAGES[errorKey]}</Callout>
    </div>
  );
}

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const flags = getFeatureFlags();

  return (
    <div className="flex flex-col items-center">
      <JsonLd data={HOME_JSON_LD} />
      <Suspense fallback={null}>
        <AuthErrorNotice searchParams={searchParams} />
      </Suspense>

      <div className="home-hero-bg w-full flex flex-col items-center">
        <header className="flex flex-col items-center text-center gap-5 max-w-[680px] px-6 pt-20 pb-16">
          <div className="flex flex-col items-center gap-1.5">
            <h1 className="hero-wordmark font-jb font-extrabold text-hero leading-none tracking-[-0.02em] uppercase text-name">
              <span className="text-isk">[ </span>
              Lo-Gang
              <span className="text-isk"> ]</span>
            </h1>
            <div className="font-jb font-normal text-[clamp(14px,2.4vw,24px)] tracking-[0.28em] uppercase leading-none">
              <span className="text-muted">Industries</span>
              <span className="text-isk tracking-normal">.</span>
              <span className="text-isk">tools</span>
            </div>
          </div>
          <p className="body-copy text-[13.5px] text-text leading-[1.7] max-w-[420px]">
            A collection of tools for Eve Online.
          </p>
        </header>

        <section className="w-full max-w-[1080px] px-6 pt-4 pb-20">
        <SectionLabel className="mb-4">Tools</SectionLabel>

        {/* Tailwind arbitrary-value class, not an inline `style` prop —
         * production CSP is `style-src 'self'` (no nonce, no unsafe-inline),
         * which covers the external stylesheet but NOT `style="..."`
         * attributes. Inline-style attributes would be blocked, leaving this
         * grid with no column template (so cards stack like a 1-column
         * small-viewport view) until client-side hydration / navigation
         * re-applied the styles via JS. */}
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(290px,1fr))]">
          <Link href="/sites" className="tool-tile tool-tile-live hover-bob no-underline group">
            <div className="flex items-start justify-between gap-2">
              <div className="font-display font-bold text-[20px] tracking-[0.01em] leading-[1.15] text-name">
                Wormhole Sites
              </div>
            </div>
            <p className="body-copy text-[13px] text-text leading-[1.65] flex-1">
              Browse all 69 wormhole anomalies and signatures by class, site
              type, and ISK value. Live Jita prices on ore and gas resources.
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

          <Link href="/industry" className="tool-tile tool-tile-live hover-bob no-underline group">
            <div className="flex items-start justify-between gap-2">
              <div className="font-display font-bold text-[20px] tracking-[0.01em] leading-[1.15] text-name">
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

          {flags.wormholeRollCalc ? (
            <Link href="/wormhole-roll" className="tool-tile tool-tile-live hover-bob no-underline group">
              <div className="flex items-start justify-between gap-2">
                <div className="font-display font-bold text-[20px] tracking-[0.01em] leading-[1.15] text-name">
                  Wormhole Roll Calculator
                </div>
              </div>
              <p className="body-copy text-[13px] text-text leading-[1.65] flex-1">
                Plan hole rolls with live mass tracking — know which pass collapses
                the hole before you commit the battleship.
              </p>
              <div className="flex items-center justify-between pt-[13px] border-t border-border-soft">
                <div className="flex items-center gap-1">
                  <Pill tone="orange">In development</Pill>
                </div>
                <span className="font-mono text-caption tracking-[0.06em] text-isk whitespace-nowrap transition-transform group-hover:translate-x-[2px]">
                  open →
                </span>
              </div>
            </Link>
          ) : (
            <div className="tool-tile tool-tile-soon">
              <div className="flex items-start justify-between gap-2">
                <div className="font-display font-bold text-[20px] tracking-[0.01em] leading-[1.15] text-name">
                  Wormhole Roll Calculator
                </div>
                <Pill tone="orange">Coming soon</Pill>
              </div>
              <p className="tile-desc body-copy text-[13px] text-text leading-[1.65] flex-1">
                Plan hole rolls with live mass tracking — know which pass collapses
                the hole before you commit the battleship.
              </p>
              <div className="flex items-center justify-between pt-[13px] border-t border-border-soft">
                <div className="flex items-center gap-1">
                  <Pill tone="orange">In development</Pill>
                </div>
                <span className="text-[10px] text-muted tracking-[0.04em]">v5.0</span>
              </div>
            </div>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}
