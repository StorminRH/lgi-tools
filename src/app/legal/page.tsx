import Link from 'next/link';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionLabel } from '@/components/ui/section-label';
import { EVE_AUTHORIZED_APPS_URL } from '@/features/auth/eve-sso';

export const metadata = {
  title: 'Privacy',
  description:
    'How LGI.tools handles your data — anonymous site usage, and the EVE character data you grant via EVE SSO.',
  alternates: { canonical: '/legal' },
};

// Major-section heading inside the reading column — Barlow display, one tier
// below the page H1, above the "// label" SectionLabel sub-heads.
const SECTION_HEAD =
  'font-display font-bold uppercase text-name text-[19px] leading-none tracking-[0.02em]';

export default function LegalPage() {
  return (
    <PageShell>
      <PageHead
        crumb="privacy"
        title="Privacy"
        meta={
          <span>
            Last updated <b className="text-name font-semibold">25 Jun 2026</b>
          </span>
        }
      />

      <div className="pb-16">
        <div className="legal-prose">
          <h2 className={`${SECTION_HEAD} mb-3`}>Personal Data</h2>
          <p className="mb-7">
            What the site itself records about your visit — no EVE sign-in required.
          </p>

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

          <h2 className={`${SECTION_HEAD} mt-12 pt-10 border-t border-border-soft mb-3`}>
            EVE SSO Data
          </h2>
          <p className="mb-7">
            What we read from your EVE characters once you sign in, and how we protect it.
          </p>

          <section className="mb-8">
            <SectionLabel className="mb-3">What signing in shares</SectionLabel>
            <p>
              When you sign in with <strong>EVE SSO</strong>, you grant LGI.tools read-only access to
              a small, fixed set of your character data. We read that data on our own servers and keep
              a synced copy so the live tools — your skills, skill queue, and industry jobs — stay
              current. So this is <strong>not an operator-blind service</strong>: the server genuinely
              reads the EVE data you grant in order to run the tools. What keeps it safe is everything
              below — we ask for the least access possible, all of it read-only, we store it
              encrypted, and we delete it when you&apos;re done.
            </p>
          </section>

          <section className="mb-8">
            <SectionLabel className="mb-3">The access we ask for</SectionLabel>
            <p>We request exactly four read-only scopes — nothing more:</p>
            <ul>
              <li>Read your public character info</li>
              <li>Read your trained skills</li>
              <li>Read your skill queue</li>
              <li>Read your industry jobs</li>
            </ul>
            <p>
              That is the whole list. We have <strong>zero write access</strong> — we cannot train
              skills, start or cancel jobs, move assets, send mail, or change anything on your
              character or account. We do not request your <strong>location</strong>,{' '}
              <strong>wallet</strong>, <strong>mail</strong>, <strong>assets</strong>,{' '}
              <strong>contacts</strong>, or <strong>fittings</strong>. If a future feature ever needs
              more, we will ask for it narrowly, only when that feature ships, and disclose it here
              first. You can see exactly what each of your characters has granted on your{' '}
              <Link href="/characters">Characters</Link> page.
            </p>
          </section>

          <section className="mb-8">
            <SectionLabel className="mb-3">How long we keep it</SectionLabel>
            <p>
              Your synced EVE data is a <strong>regenerable cache</strong>, not a record we own — it
              can be rebuilt from EVE at any time. We delete a character&apos;s data when you{' '}
              <strong>unlink</strong> it, and we wipe it automatically if a character{' '}
              <strong>changes hands</strong>. When a character is sold or transferred, EVE issues a
              new owner stamp; we check it on every sign-in and purge the previous owner&apos;s data,
              so it never follows the character to its new pilot.
            </p>
          </section>

          <section className="mb-8">
            <SectionLabel className="mb-3">How it&apos;s stored</SectionLabel>
            <p>
              Every call we make to EVE goes through a single gated path on our servers. Your access
              tokens are <strong>encrypted at rest</strong> (AES-256-GCM), and the long-lived refresh
              token <strong>never leaves our database</strong> — the live tools only ever receive
              short-lived access tokens.
            </p>
          </section>

          <section className="mb-8">
            <SectionLabel className="mb-3">We don&apos;t share it</SectionLabel>
            <p>
              We never sell your EVE data or share it with third parties. For the anonymous usage data
              the site itself records, see <strong>Personal Data</strong> above.
            </p>
          </section>

          <section className="mb-8">
            <SectionLabel className="mb-3">You stay in control</SectionLabel>
            <ul>
              <li>
                See exactly what each character has granted on your{' '}
                <Link href="/characters">Characters</Link> page.
              </li>
              <li>
                Revoke LGI.tools entirely, at any time, from your{' '}
                <a href={EVE_AUTHORIZED_APPS_URL} target="_blank" rel="noopener noreferrer">
                  EVE authorized apps
                </a>{' '}
                page.
              </li>
              <li>
                Unlink any character yourself from the{' '}
                <Link href="/characters">Characters</Link> page.
              </li>
            </ul>
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
              , so every claim on this page is auditable. Issues, feature requests, and pull requests
              are welcome.
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
