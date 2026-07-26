import { CharacterPortrait } from '@/components/character-portrait';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionLabel } from '@/components/ui/section-label';
import { EntityRow } from '@/components/ui/row';
import { eyebrow } from '@/components/ui/type-roles';
import { buildPageMetadata } from '@/lib/page-metadata';

/** Static search and social metadata for the /contact route. */
export const metadata = buildPageMetadata({
  title: 'Contact',
  description: 'Reach the developer of LGI.tools — bug reports, ideas, and data corrections.',
  canonical: '/contact',
});

// The maintainer's public identity, shown in the "In-game" panel. The portrait
// is served by the EVE image server (a CSP-allowed host); names link to EVE Who.
// All fixed values, so the page stays fully static.
const MAINTAINER_CHARACTER_ID = 2123732314;
const MAINTAINER_CHARACTER_NAME = 'Stormin Jr';
const MAINTAINER_CORPS = [
  { id: 98825718, name: 'Lo-Gang' },
  { id: 98834571, name: 'Lo-Gang Industries' },
];
const CONTACT_EMAIL = 'lgi.tools@pm.me';

/**
 * Renders the /contact route surface and owns its page-level composition, metadata boundary, and
 * fallback presentation.
 */
export default function ContactPage() {
  return (
    <PageShell mode="reading">
      <PageHead
        size="hero"
        crumb="contact"
        title="Contact"
        meta={
          <span className={eyebrow()}>
            Replies usually within <b className="text-name font-semibold">a day or two</b>
          </span>
        }
      />

      <div className="pb-16">
        <p className="mb-[26px] max-w-[640px] text-pretty text-body leading-[1.72] tracking-optical text-text">
          Found a bug, have data that looks wrong, or want a tool added? Email{' '}
          <b>Lo-Gang Industries</b>{' '}directly, or open a GitHub issue for anything you&apos;d like
          tracked.
        </p>

        <div className="grid items-stretch gap-4 md:grid-cols-2">
          <Card>
            <SectionLabel className="mb-cluster px-3.5 pt-3.5">Get in touch</SectionLabel>
            <EntityRow
              colsClass="grid-cols-[96px_minmax(0,1fr)]"
              leading="Email"
              name={
                <span className="font-data text-ui text-text">
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                <span className="mt-1 block text-micro text-muted">Bug reports, ideas, and data corrections</span>
              </span>
              }
            />
            <EntityRow
              colsClass="grid-cols-[96px_minmax(0,1fr)]"
              leading="GitHub"
              name={
                <span className="font-data text-ui text-text">
                <a
                  href="https://github.com/StorminRH/lgi-tools"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/StorminRH/lgi-tools
                </a>
                <span className="mt-1 block text-micro text-muted">Open an issue or pull request</span>
              </span>
              }
            />
            <EntityRow
              colsClass="grid-cols-[96px_minmax(0,1fr)]"
              leading="Discord"
              name={
                <span className="text-ui text-text">
                Coming soon
                <span className="mt-1 block text-micro text-muted">A community server is in the works</span>
              </span>
              }
            />
          </Card>

          <Card>
            <SectionLabel className="mb-cluster px-3.5 pt-3.5">In-game</SectionLabel>
            <EntityRow
              colsClass="grid-cols-[96px_minmax(0,1fr)]"
              leading="Character"
              name={
                <span className="flex min-w-0 items-center gap-2.5">
                  <CharacterPortrait
                    characterId={MAINTAINER_CHARACTER_ID}
                    name={MAINTAINER_CHARACTER_NAME}
                    size={38}
                  />
                  <span className="flex min-w-0 flex-col">
                    <a
                      href={`https://evewho.com/character/${MAINTAINER_CHARACTER_ID}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display text-ui font-bold leading-[1.15] text-name hover:text-isk"
                    >
                      {MAINTAINER_CHARACTER_NAME}
                    </a>
                    <span className="mt-0.5 text-micro text-muted">EVE mail welcome</span>
                  </span>
                </span>
              }
            />
            <EntityRow
              colsClass="grid-cols-[96px_minmax(0,1fr)]"
              leading="Corps"
              name={
                <span className="font-data text-ui text-text">
                {MAINTAINER_CORPS.map((corp, i) => (
                  <span key={corp.id}>
                    {i > 0 && ' / '}
                    <a
                      href={`https://evewho.com/corporation/${corp.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display font-bold text-name hover:text-isk"
                    >
                      {corp.name}
                    </a>
                  </span>
                ))}
              </span>
              }
            />
            <EntityRow
              colsClass="grid-cols-[96px_minmax(0,1fr)]"
              leading="Support"
              name={
                <span className="text-ui text-text">
                ISK &amp; PLEX donations
                <span className="mt-1 block text-micro text-muted">
                  Keeps the lights on — send to the Lo-Gang corp wallet
                </span>
              </span>
              }
            />
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
