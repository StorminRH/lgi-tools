import Link from 'next/link';
import { PageFooter } from '@/components/ui/page-footer';
import { APP_VERSION } from '@/config/app-version';

// Application-shell footer. Fenris Creations (formerly CCP Games, rebranded
// 2026-05-06) trademark notice on the left; version-as-changelog-link on
// the right. The Feedback affordance lives in `<FeedbackButton>` — a fixed
// floating element so it's reachable at any scroll position.
export function Footer() {
  return (
    <PageFooter
      left={
        <span className="font-mono text-muted tracking-[0.12em] uppercase">
          EVE Online and the EVE logo are the registered trademarks of Fenris Creations. All rights reserved.
          {' · '}
          <Link href="/legal">
            Legal
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
