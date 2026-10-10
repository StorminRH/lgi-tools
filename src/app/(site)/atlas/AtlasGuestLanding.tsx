import { EveSignInButton } from '@/components/composition/account/LoginButton';
import { AccessGate } from '@/components/ui/access-gate';
import { PageShell } from '@/components/ui/page-shell';
import { Pill } from '@/components/ui/pill';
import { SectionPanel } from '@/components/ui/section-panel';
import { ATLAS_TAGLINE } from '@/features/maps/atlas-copy';

const SETUP_STEPS = [
  {
    title: 'Log in with EVE Online',
    detail: 'Use your EVE character.',
  },
  {
    title: 'Link additional characters you fly',
    detail:
      'Use Add character in your account menu.',
  },
  {
    title: 'Open or create a map and turn on Tracking',
    detail:
      "Toggle tracking from your portrait. Tracking may take up to 30 seconds.",
  },
] as const;

export function AtlasGuestLanding({
  returnHref,
}: {
  readonly returnHref: string;
}) {
  return (
    <div data-atlas-guest-landing>
      <PageShell mode="workspace">
        <h1 className="sr-only">Atlas</h1>
        <div className="flex max-w-2xl flex-col gap-6 pb-16">
          <AccessGate
            blocked
            tone="green"
            className="reveal reveal-1 glass-surface glass-lit border-hairline-accent shadow-card-edge"
            title="Sign in required"
            reason={`${ATLAS_TAGLINE} Sign in to access maps and tracking.`}
            action={<EveSignInButton callbackURL={returnHref} />}
          >
            {null}
          </AccessGate>

          <SectionPanel title="Set up tracking" className="reveal reveal-2">
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
          </SectionPanel>
        </div>
      </PageShell>
    </div>
  );
}
