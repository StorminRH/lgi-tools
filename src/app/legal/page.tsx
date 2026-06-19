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
            Last updated <b className="text-name font-semibold">14 Jun 2026</b>
          </span>
        }
      />

      <div className="pb-16">
        <div className="legal-prose">
          <section className="mb-8">
            <SectionLabel className="mb-3">What we collect</SectionLabel>
            <p>
              <strong>LGI.tools (Lo-Gang Industries)</strong> records its own usage so we can
              understand what the site is being used for and report aggregated engagement to
              CCP&apos;s EVE Partner Program. We do this without third-party trackers — no Google
              Analytics, no Plausible, no PostHog.
            </p>
            <p>Specifically, we record:</p>
            <ul>
              <li>
                The URL path you visit (for example, <strong>/sites</strong>).
              </li>
              <li>
                The hostname of the site that linked you to us (for example,{' '}
                <strong>discord.com</strong>), and any <strong>utm_source</strong> /{' '}
                <strong>utm_medium</strong> / <strong>utm_campaign</strong> tags present on the URL
                you arrived through. We never record the full referring URL — only the hostname.
              </li>
              <li>
                A randomly-generated visitor ID kept in your browser&apos;s{' '}
                <strong>localStorage</strong>. It is used to distinguish a first-time lander from a
                returning page-hopper — nothing more. Clearing your browser storage clears the ID.
              </li>
              <li>
                Your EVE character ID, but only if you are logged in via EVE SSO. If you are not
                logged in, the same events are recorded anonymously.
              </li>
              <li>
                When you send feedback through the in-app feedback button, the page you were on at
                the time, and the length of your message. The message text itself is forwarded to a
                private Discord channel for the developer to read — it is not stored in our database.
              </li>
              <li>
                When you send a message through the contact form, the length of your message. Your
                email address and the message text are emailed directly to the developer so they can
                reply — they are not stored in our database.
              </li>
            </ul>
            <p>
              We do <strong>not</strong> record your IP address, your browser user-agent, or any
              session fingerprint. Data is stored in our own Neon Postgres database and used only for
              product understanding and aggregated EVE Partner Program reporting.
            </p>
            <p>
              If you would prefer not to be attributed by character, log out via the header and
              continue using the site — your visits will be recorded anonymously.
            </p>
            <p>
              Page performance metrics — load time, layout shift, and other{' '}
              <a href="https://web.dev/articles/vitals" target="_blank" rel="noopener noreferrer">
                Core Web Vitals
              </a>{' '}
              — are collected anonymously by Vercel Speed Insights, the analytics product built into
              our hosting provider. This is performance telemetry only: no behavioural tracking, no
              advertising profile, no cross-site identity. The data is aggregated by Vercel and used
              to surface slow pages so we can fix them.
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
              . The full source lives at{' '}
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
              <b>EVE Online</b> and the EVE logo are the registered trademarks of Fenris Creations
              (formerly CCP hf, rebranded 2026-05-06). All artwork, screenshots, characters,
              vehicles, storylines, world facts, or other recognizable features of the intellectual
              property relating to these trademarks are likewise the intellectual property of Fenris
              Creations.
            </p>
            <p>
              LGI.tools is an independent third-party tool built by EVE Online players for EVE Online
              players. It is not affiliated with, endorsed by, or sponsored by Fenris Creations. All
              EVE Online-related content on this site is used under Fenris Creations&apos; third-party
              developer license.
            </p>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
