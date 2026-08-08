import { Suspense } from 'react';
import { AppHeader } from '@/components/composition/AppHeader';
import { FeedbackButton } from '@/components/composition/FeedbackButton';
import { Footer } from '@/components/composition/Footer';

function AppHeaderFallback() {
  return (
    <header
      className="app-header flex h-[50px] items-stretch border-b border-border bg-section max-lg:h-auto"
      aria-hidden="true"
    />
  );
}

/**
 * Renders the site header, main region, footer, and feedback affordance.
 * The root unmatched-URL page and the site route-group layout share this owner
 * so each path composes exactly one chrome layer. Header data reads are cached,
 * but a Suspense hole keeps soft navigations instant if a remote miss streams.
 */
export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<AppHeaderFallback />}>
        <AppHeader />
      </Suspense>
      <main className="flex-1">{children}</main>
      <Footer />
      <FeedbackButton />
    </>
  );
}
