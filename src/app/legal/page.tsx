import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionLabel } from '@/components/ui/section-label';
import { EVE_AUTHORIZED_APPS_URL } from '@/platform/auth/eve-sso-constants';
import { buildPageMetadata } from '@/lib/page-metadata';

/** Static search and social metadata for the /legal route. */
export const metadata = buildPageMetadata({
  title: 'Privacy',
  description:
    'How LGI.tools handles site usage data and the EVE character data you grant through EVE SSO.',
  canonical: '/legal',
});

// Major-section heading inside the reading column — Barlow display, one tier
// below the page H1, above the "// label" SectionLabel sub-heads.
const SECTION_HEAD =
  'font-display font-bold uppercase text-name text-h3 leading-none tracking-[0.02em]';

// One "// label" sub-head + its prose body — the reading column's repeated unit.
function LegalSection({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      <SectionLabel className="mb-3">{label}</SectionLabel>
      {children}
    </section>
  );
}

/**
 * Renders the /legal route surface and owns its page-level composition, metadata boundary, and
 * fallback presentation.
 */
export default function LegalPage() {
  return (
    <PageShell>
      <PageHead
        crumb="privacy"
        title="Privacy"
        meta={
          <span>
            Last updated <b className="text-name font-semibold">19 Jul 2026</b>
          </span>
        }
      />

      <div className="pb-16">
        <div className="legal-prose">
          <h2 className={`${SECTION_HEAD} mb-3`}>Site Usage</h2>
          <p className="mb-7">What the site records about your visit.</p>

          <LegalSection label="In-house telemetry">
            <p>
              LGI.tools (Lo-Gang Industries) keeps a limited set of data points about how the site is
              used: which pages and options get used, how visitors move through them, and what brought
              them here—for example, if you came from Google, Reddit, the EVE forums, etc. That data
              is held in our{' '}
              <a href="https://neon.com" target="_blank" rel="noopener noreferrer">
                Neon
              </a>{' '}
              database on a 180-day retention schedule and is shown on the LGI.tools admin dashboard.
            </p>
          </LegalSection>

          <LegalSection label="Performance & rate limiting">
            <p>
              Like any website, we handle ordinary request and network information to deliver pages,
              keep the service running, and prevent abuse. This includes storing your IP address in
              the rate-limit service{' '}
              <a href="https://upstash.com" target="_blank" rel="noopener noreferrer">
                Upstash Redis
              </a>{' '}
              to enforce limits and record whether requests were allowed or blocked. The IP address
              is not added to our in-house usage log.
            </p>
            <p>
              We also measure page performance anonymously to find and fix slow pages.
            </p>
          </LegalSection>

          <LegalSection label="Cookies & local storage">
            <p>
              We store a random visitor ID in your browser&apos;s local storage. It lets us recognize
              a returning browser and connect page views from the same browser. Clearing this
              site&apos;s stored data removes it, and the site treats that browser as a first-time
              visitor again. When you log in, the site also uses a session cookie to keep you signed
              in.
            </p>
          </LegalSection>

          <h2 className={`${SECTION_HEAD} mt-12 pt-10 border-t border-border-soft mb-3`}>
            EVE Data
          </h2>
          <p className="mb-7">
            What signing in shares, why the site needs it, and what control you keep.
          </p>

          <LegalSection label="What signing in shares">
            <p>
              When you log in with{' '}
              <strong>
                <a
                  href="https://developers.eveonline.com/docs/services/sso/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  EVE SSO
                </a>
              </strong>
              , EVE tells us who your character is, and you grant LGI.tools access to some of your EVE
              character data. EVE lists the requested scopes on its consent screen. You can review
              the granted scopes afterward on your EVE account&apos;s{' '}
              <a href={EVE_AUTHORIZED_APPS_URL} target="_blank" rel="noopener noreferrer">
                Authorized Applications page
              </a>
              . The <Link href="/characters">Characters page</Link> also shows what each linked
              character has granted.
            </p>
          </LegalSection>

          <LegalSection label="You stay in control">
            <p>
              You control your data. The <strong>Purge</strong> control on your{' '}
              <Link href="/characters">Characters page</Link>{' '}
              deletes the private EVE data stored for one character and removes LGI.tools access to
              it. Deleting your entire account removes the account, its sessions and linked
              characters, along with the rest of any account-specific data. Public or
              corporation-shared EVE records are not private account data and are not removed by this
              control. For example, if you had access to a corporation&apos;s structures as a member
              of that corp and you delete your character from LGI.tools, there is an audit record
              saved for that corporation showing you had access at one point.
            </p>
          </LegalSection>

          <LegalSection label="Corporation audit records">
            <p>
              Corporation-access audit records are retained for 400 days. They contain the user,
              character, and corporation identifiers involved in an access decision, the
              allow-or-deny result, and the reason. They let LGI.tools investigate and verify past
              access decisions; they are not used for analytics.
            </p>
          </LegalSection>

          <LegalSection label="Character transfer detection">
            <p>
              Each time a character logs in, we check whether it has changed hands in the game, such
              as through a sale on the{' '}
              <a
                href="https://forums.eveonline.com/c/marketplace/character-bazaar/60"
                target="_blank"
                rel="noopener noreferrer"
              >
                Character Bazaar
              </a>
              . If it has, we remove the previous owner&apos;s account link and stored credentials
              before the login completes. The new pilot is then treated as a different LGI.tools user
              and cannot enter the previous pilot&apos;s account. Corporation access is checked
              separately against the new account&apos;s current linked characters, corporation
              membership, and roles, so the new pilot does not inherit the previous owner&apos;s
              corporation access.
            </p>
          </LegalSection>

          <h2 className={`${SECTION_HEAD} mt-12 pt-10 border-t border-border-soft mb-7`}>
            Our Privacy Stance
          </h2>

          <LegalSection label="What we never do">
            <p>
              We never sell your data—the usage records or the EVE data—and we never provide it to
              anyone for their own advertising, marketing, or profiling. LGI.tools relies on
              third-party infrastructure and{' '}
              <a
                href="https://developers.eveonline.com/docs/services/esi/overview/"
                target="_blank"
                rel="noopener noreferrer"
              >
                EVE&apos;s official APIs
              </a>{' '}
              to operate, so those services process only the data necessary to deliver and protect
              the site.
            </p>
            <p>
              There is no advertising anywhere on LGI.tools: no ad networks, no cross-site tracking,
              and no device fingerprinting.
            </p>
          </LegalSection>

          <LegalSection label="Open-source licensing">
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
              , so every claim on this page is auditable. You may also visit the dev log{' '}
              <Link href="/devlog">Under the Hood</Link> for a guided walkthrough on how this app is
              being built and a more technical overview of all the privacy-related features. The dev
              log is not always current; I update it as I build periodically.
            </p>
          </LegalSection>

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
