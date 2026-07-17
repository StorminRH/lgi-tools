import { CharacterPortrait } from '@/components/character-portrait';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionLabel } from '@/components/ui/section-label';
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
    <PageShell>
      <PageHead
        crumb="contact"
        title="Contact"
        meta={
          <span>
            Replies usually within <b className="text-name font-semibold">a day or two</b>
          </span>
        }
      />

      <div className="pb-16">
        <p className="contact-intro">
          Found a bug, have data that looks wrong, or want a tool added? Email{' '}
          <b>Lo-Gang Industries</b>{' '}directly, or open a GitHub issue for anything you&apos;d like
          tracked.
        </p>

        <div className="contact-grid">
          <div className="contact-panel">
            <SectionLabel className="mb-2">Get in touch</SectionLabel>
            <div className="contact-row">
              <span className="k">Email</span>
              <span className="v">
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                <span className="sub">Bug reports, ideas, and data corrections</span>
              </span>
            </div>
            <div className="contact-row">
              <span className="k">GitHub</span>
              <span className="v">
                <a
                  href="https://github.com/StorminRH/lgi-tools"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/StorminRH/lgi-tools
                </a>
                <span className="sub">Open an issue or pull request</span>
              </span>
            </div>
            <div className="contact-row">
              <span className="k">Discord</span>
              <span className="v">
                Coming soon
                <span className="sub">A community server is in the works</span>
              </span>
            </div>
          </div>

          <div className="contact-panel">
            <SectionLabel className="mb-2">In-game</SectionLabel>
            <div className="contact-row is-id">
              <span className="k">Character</span>
              <span className="v">
                <span className="contact-id">
                  <CharacterPortrait
                    characterId={MAINTAINER_CHARACTER_ID}
                    name={MAINTAINER_CHARACTER_NAME}
                    size={38}
                  />
                  <span className="contact-id-text">
                    <a
                      href={`https://evewho.com/character/${MAINTAINER_CHARACTER_ID}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="contact-id-name"
                    >
                      {MAINTAINER_CHARACTER_NAME}
                    </a>
                    <span className="sub">EVE mail welcome</span>
                  </span>
                </span>
              </span>
            </div>
            <div className="contact-row">
              <span className="k">Corps</span>
              <span className="v">
                {MAINTAINER_CORPS.map((corp, i) => (
                  <span key={corp.id}>
                    {i > 0 && ' / '}
                    <a
                      href={`https://evewho.com/corporation/${corp.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="contact-id-name"
                    >
                      {corp.name}
                    </a>
                  </span>
                ))}
              </span>
            </div>
            <div className="contact-row">
              <span className="k">Support</span>
              <span className="v">
                ISK &amp; PLEX donations
                <span className="sub">
                  Keeps the lights on — send to the Lo-Gang corp wallet
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
