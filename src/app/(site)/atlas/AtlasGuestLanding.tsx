'use client';

import { useSearchParams } from 'next/navigation';
import { EveSignInButton } from '@/components/composition/account/LoginButton';
import { AccessGate } from '@/components/ui/access-gate';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { atlasSignInReturnHref } from '@/features/maps/map-navigation';

const SETUP_STEPS = [
  {
    title: 'Log in with EVE Online',
    detail:
      'Signing in links that character to your account with the read-only location, ship, and online access Atlas uses to follow it.',
  },
  {
    title: 'Link the characters you fly in the chain',
    detail:
      'Open the account menu behind your portrait, top right, and choose Add character. Each linked character appears under Characters and can be tracked on any map.',
  },
  {
    title: 'Open a map and turn on Tracking',
    detail:
      'With a map open, the account menu gains a Tracking section. Pick the pilots to follow and Atlas places them in the chain and moves them as they jump.',
  },
] as const;

/**
 * The signed-out Atlas landing. Maps, membership, and location tracking are all
 * per-account, so a guest sees the sign-in gate plus the short setup path
 * instead of an empty catalogue with controls that cannot succeed. The sign-in
 * returns here, keeping a shared `?map=` selection through the round-trip.
 */
export function AtlasGuestLanding() {
  const returnHref = atlasSignInReturnHref(useSearchParams());

  return (
    <div data-atlas-guest-landing>
      <PageShell mode="workspace">
        <PageHead
          size="hero"
          crumb="atlas"
          title="Atlas"
          subtitle="Chart wormhole chains, paste scanner results, and share a live map with your corporation."
        />
        <div className="flex max-w-2xl flex-col gap-6 pb-16">
          <AccessGate
            blocked
            tone="green"
            title="Sign in required"
            reason="Maps are shared through your account and corporation, and the live chain follows your own characters. Log in with EVE Online to create a map, open one shared with you, or track your pilots as they jump."
            action={<EveSignInButton callbackURL={returnHref} />}
          >
            {null}
          </AccessGate>

          <Card>
            <SectionHeader size="md" label="Set up tracking" hint="after you sign in" />
            <ol data-atlas-guest-steps>
              {SETUP_STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="flex items-start gap-3 border-b border-border-soft px-3.5 py-3 last:border-b-0"
                >
                  <Pill tone="green" className="shrink-0 tabular-nums">
                    {index + 1}
                  </Pill>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-ui text-name">{step.title}</span>
                    <p className="text-ui leading-relaxed text-muted">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </PageShell>
    </div>
  );
}
