import type { Metadata } from 'next';
import { PageHead } from '@/components/ui/page-head';
import { SectionLabel } from '@/components/ui/section-label';
import { ContactForm } from '@/features/contact/components/ContactForm';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Reach the developer of LGI.tools — bug reports, ideas, and data corrections.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <div className="w-full">
      <PageHead
        crumb="contact"
        title="Contact"
        meta={
          <span>
            Replies usually within <b className="text-name font-semibold">a day or two</b>
          </span>
        }
      />

      <div className="w-full max-w-[1080px] mx-auto px-7 pb-16">
        <p className="contact-intro">
          Found a bug, have data that looks wrong, or want a tool added? Send a message to{' '}
          <b>Lo-Gang Industries</b> below, or open an issue on GitHub for anything you&apos;d like
          tracked.
        </p>

        <div className="contact-grid">
          <div className="contact-panel">
            <SectionLabel className="mb-2">Send a message</SectionLabel>
            <ContactForm />
          </div>

          <div className="contact-panel">
            <SectionLabel className="mb-2">Elsewhere</SectionLabel>
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
              <span className="k">Corp</span>
              <span className="v">Lo-Gang Industries</span>
            </div>
            <div className="contact-row">
              <span className="k">Discord</span>
              <span className="v">
                Coming soon
                <span className="sub">A community server is in the works</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
