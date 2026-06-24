import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionLabel } from '@/components/ui/section-label';

export const metadata = {
  title: 'Legal',
  description: 'Telemetry collection disclosure and EVE Online developer notice.',
  alternates: { canonical: '/legal' },
};

export default function LegalPage() {
  return (
    <PageShell>
      <PageHead
        crumb="legal"
        title="Legal"
        meta={
          <span>
            Last updated <b className="text-name font-semibold">23 Jun 2026</b>
          </span>
        }
      />

      <div className="pb-16">
        <div className="legal-prose">
          <section className="mb-8">
            <SectionLabel className="mb-3">What we collect</SectionLabel>
            <p>
              <strong>LGI.tools (Lo-Gang Industries)</strong> records its own usage in our own{' '}
              <a href="https://neon.com/security" target="_blank" rel="noopener noreferrer">
                Neon Postgres
              </a>{' '}
              database — no third-party trackers, no <strong>Google Analytics</strong>,{' '}
              <strong>Plausible</strong>, or <strong>PostHog</strong>. We record:
            </p>
            <ul>
              <li>
                The <strong>URL path</strong> you visit (e.g. <strong>/sites</strong>).
              </li>
              <li>
                The <strong>site</strong> that linked you here (e.g. <strong>discord.com</strong>)
                and any campaign tags (<strong>utm_source</strong>, <strong>utm_medium</strong>,{' '}
                <strong>utm_campaign</strong>) on the link you arrived through — never the full web
                address, just the site.
              </li>
              <li>
                A random ID stored in your browser, used only to tell a first-time visitor from a
                returning one. Clearing your browser data removes it.
              </li>
              <li>
                Your <strong>EVE character ID</strong>, if you are logged in via EVE SSO.
              </li>
              <li>
                <strong>Feedback button:</strong>{' '}
                the page you were on and your message&apos;s length. The text is forwarded to a
                private Discord channel for the developer — not stored in our database.
              </li>
              <li>
                <strong>Contact form:</strong>{' '}
                your message&apos;s length. Your email and the text are emailed straight to the
                developer to reply — not stored in our database.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <SectionLabel className="mb-3">What we don&apos;t collect</SectionLabel>
            <p>
              We do <strong>not</strong>{' '}
              record your IP address, the browser or device you&apos;re using, or any kind of device
              fingerprint.
            </p>
          </section>

          <section className="mb-8">
            <SectionLabel className="mb-3">How it&apos;s used &amp; opting out</SectionLabel>
            <p>
              This data is used only to understand how the site is used so we can make it better. To
              avoid being attributed by character, log out via the header and keep using the site —
              your visits are then recorded anonymously.
            </p>
          </section>

          <section className="mb-8">
            <SectionLabel className="mb-3">Performance telemetry</SectionLabel>
            <p>
              Load time, layout shift, and other{' '}
              <a href="https://web.dev/articles/vitals" target="_blank" rel="noopener noreferrer">
                Core Web Vitals
              </a>{' '}
              are collected anonymously by <strong>Vercel Speed Insights</strong>, aggregated to
              surface slow pages we can fix. Performance only — no behavioural tracking, advertising
              profile, or cross-site identity.
            </p>
          </section>

          <section className="mb-8">
            <SectionLabel className="mb-3">Open-source licensing</SectionLabel>
            <p>
              LGI.tools is open-source under the{' '}
              <a
                href="https://github.com/StorminRH/lgi-tools/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
              >
                MIT License
              </a>
              , with full source at{' '}
              <a
                href="https://github.com/StorminRH/lgi-tools"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/StorminRH/lgi-tools
              </a>
              . Issues, feature requests, and pull requests are welcome.
            </p>
          </section>

          <div className="legal-note">
            <p>
              <b>EVE Online</b> and the EVE logo are registered trademarks of Fenris Creations
              (formerly CCP hf, rebranded 2026-05-06). All artwork, screenshots, characters,
              vehicles, storylines, world facts, and other recognizable features of the intellectual
              property relating to these trademarks are likewise the intellectual property of Fenris
              Creations.
            </p>
            <p>
              LGI.tools is an independent third-party tool built by EVE Online players for EVE Online
              players. It is not affiliated with, endorsed by, or sponsored by Fenris Creations. All
              EVE Online-related content here is used under Fenris Creations&apos; third-party
              developer license.
            </p>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
