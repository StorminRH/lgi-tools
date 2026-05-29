import { Card } from '@/components/ui/card';

export const metadata = {
  title: 'Legal',
  description: 'Telemetry collection disclosure and EVE Online developer notice.',
};

export default function LegalPage() {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <header className="w-full max-w-[800px] mb-6 pb-4 border-b border-border-soft">
        <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
          Legal &amp; Privacy
        </div>
        <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
          What we collect, and the EVE Online developer notice.
        </div>
      </header>

      <div className="w-full max-w-[800px] flex flex-col gap-4">
        <Card className="px-5 py-5 flex flex-col gap-3">
          <div className="font-display font-bold text-[16px] tracking-[0.06em] uppercase text-name">
            What we collect
          </div>
          <p className="text-[12px] leading-relaxed text-text">
            LGI.tools records its own usage so we can understand what the site is being
            used for and report aggregated engagement to CCP&apos;s EVE Partner Program.
            We do this without third-party trackers — no Google Analytics, no Plausible,
            no PostHog.
          </p>
          <p className="text-[12px] leading-relaxed text-text">
            Specifically, we record:
          </p>
          <ul className="text-[12px] leading-relaxed text-text list-disc pl-5 flex flex-col gap-1">
            <li>The URL path you visit (for example, <span className="font-mono">/sites</span>).</li>
            <li>
              The terminal-search query you type on the wormhole sites page
              (for example, <span className="font-mono">c3/relic</span>).
            </li>
            <li>
              The hostname of the site that linked you to us (for example,{' '}
              <span className="font-mono">discord.com</span>), and any{' '}
              <span className="font-mono">utm_source</span> /{' '}
              <span className="font-mono">utm_medium</span> /{' '}
              <span className="font-mono">utm_campaign</span> tags present on the URL you arrived
              through. We never record the full referring URL — only the hostname.
            </li>
            <li>
              A randomly-generated visitor ID kept in your browser&apos;s{' '}
              <span className="font-mono">localStorage</span>. It is used to distinguish a
              first-time lander from a returning page-hopper — nothing more. Clearing your
              browser storage clears the ID.
            </li>
            <li>
              Your EVE character ID, but only if you are logged in via EVE SSO. If you are
              not logged in, the same events are recorded anonymously.
            </li>
            <li>
              When you send feedback through the in-app feedback button, the page you were
              on at the time, and the length of your message. The message text itself is
              forwarded to a private Discord channel for the developer to read — it is
              not stored in our database.
            </li>
            <li>
              When you send a message through the contact form, the length of your message.
              Your email address and the message text are emailed directly to the developer
              so they can reply — they are not stored in our database.
            </li>
          </ul>
          <p className="text-[12px] leading-relaxed text-text">
            We do <span className="text-name">not</span> record your IP address, your
            browser user-agent, or any session fingerprint. Data is stored in our own
            Neon Postgres database and used only for product understanding and aggregated
            EVE Partner Program reporting.
          </p>
          <p className="text-[12px] leading-relaxed text-text">
            If you would prefer not to be attributed by character, log out via the header
            and continue using the site — your visits will be recorded anonymously.
          </p>
          <p className="text-[12px] leading-relaxed text-text">
            Page performance metrics — load time, layout shift, and other{' '}
            <a
              href="https://web.dev/articles/vitals"
              target="_blank"
              rel="noopener noreferrer"
            >
              Core Web Vitals
            </a>
            {' '}— are collected anonymously by Vercel Speed Insights, the analytics
            product built into our hosting provider. This is performance telemetry only:
            no behavioural tracking, no advertising profile, no cross-site identity. The
            data is aggregated by Vercel and used to surface slow pages so we can fix them.
          </p>
        </Card>

        <Card className="px-5 py-5 flex flex-col gap-3">
          <div className="font-display font-bold text-[16px] tracking-[0.06em] uppercase text-name">
            EVE Online developer notice
          </div>
          <p className="text-[12px] leading-relaxed text-text">
            EVE Online and the EVE logo are the registered trademarks of Fenris Creations
            (formerly CCP hf, rebranded 2026-05-06). All artwork, screenshots, characters,
            vehicles, storylines, world facts, or other recognizable features of the
            intellectual property relating to these trademarks are likewise the intellectual
            property of Fenris Creations.
          </p>
          <p className="text-[12px] leading-relaxed text-text">
            LGI.tools is an independent third-party tool built by EVE Online players for
            EVE Online players. It is not affiliated with, endorsed by, or sponsored by
            Fenris Creations. All EVE Online-related content on this site is used under
            Fenris Creations&apos; third-party developer license.
          </p>
        </Card>

        <Card className="px-5 py-5 flex flex-col gap-3">
          <div className="font-display font-bold text-[16px] tracking-[0.06em] uppercase text-name">
            Open-source licensing
          </div>
          <p className="text-[12px] leading-relaxed text-text">
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
        </Card>
      </div>
    </div>
  );
}
