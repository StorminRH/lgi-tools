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
      left={
        <span className="font-mono text-muted tracking-[0.12em] uppercase">
          <span className="font-jb font-bold text-[11px] text-name normal-case tracking-normal">
            Lo-Gang Industries
          </span>
          {' · '}
          EVE Online and the EVE logo are the registered trademarks of Fenris Creations. All rights reserved.
          {' · '}
          <Link href="/legal">
            Legal
          </Link>
          {' · '}
          <Link href="/contact">
            Contact
          </Link>
        </span>
      }
      center={
        <Link
          href="/changelog"
          className="font-mono text-muted uppercase tracking-[0.12em]"
        >
          v{APP_VERSION}
        </Link>
      }
    />
  );
}
