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
    detail: 'The character you log in with creates your account and allows Atlas to track it.',
  },
  {
    title: 'Link additional characters you fly',
    detail:
      'Open the account menu behind your portrait, top right, and choose Add character for each alt you would like to track.',
  },
  {
    title: 'Open or create a map and turn on Tracking',
    detail:
      "With a map open, you may enable or disable tracking by clicking your character's portrait. Initial tracking may take up to 30 seconds to start.",
  },
] as const;

export function AtlasGuestLanding() {
  const returnHref = atlasSignInReturnHref(useSearchParams());

  return (
    <div data-atlas-guest-landing>
      <PageShell mode="workspace">
        <PageHead
          size="hero"
          crumb="atlas"
          title="Atlas"
          subtitle="A shared live map of your wormhole chain."
        />
        <div className="flex max-w-2xl flex-col gap-6 pb-16">
          <AccessGate
            blocked
            tone="green"
            title="Sign in required"
            reason="Log in with EVE Online to create a map, open one shared with you, or follow your pilots as they jump."
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
