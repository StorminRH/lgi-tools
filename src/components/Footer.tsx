import Link from 'next/link';
import { PageFooter } from '@/components/ui/page-footer';
import { APP_VERSION } from '@/config/app-version';

// Application-shell footer. The Lo-Gang Industries brand wordmark anchors the
// left slot in JetBrains Bold (the 2.9.1 wireframe contract); the Fenris
// Creations (formerly CCP Games, rebranded 2026-05-06) trademark notice
// follows in muted mono. Version-as-changelog-link lives in the center slot.
// The Feedback affordance lives in `<FeedbackButton>` — a fixed floating
// element so it's reachable at any scroll position.
export function Footer() {
  return (
    <PageFooter
      // Extra right padding keeps the links clear of the fixed Feedback button
      // anchored in the bottom-right corner (handoff §3).
      className="pr-[150px]"
      left={
        <span className="block max-w-[720px] font-mono text-muted tracking-[0.03em] leading-[1.7]">
          Lo-Gang Industries — EVE Online and all related marks are property of Fenris Creations.
          LGI.tools is an independent third-party tool, not affiliated with or endorsed by Fenris
          Creations.
        </span>
      }
      right={
        <span className="inline-flex items-center gap-4 font-mono tracking-[0.03em]">
          <Link href="/legal" className="text-muted">
            Legal
          </Link>
          <Link href="/contact" className="text-muted">
            Contact
          </Link>
          <Link href="/changelog" className="text-muted">
            Changelog
          </Link>
          <span className="text-faint">v{APP_VERSION}</span>
        </span>
      }
    />
  );
}
