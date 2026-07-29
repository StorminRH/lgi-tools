import { AppHeader } from '@/components/composition/AppHeader';
import { FeedbackButton } from '@/components/composition/FeedbackButton';
import { Footer } from '@/components/composition/Footer';

/**
 * Renders the site header, main region, footer, and feedback affordance.
 * The root unmatched-URL page and the site route-group layout share this owner
 * so each path composes exactly one chrome layer.
 */
export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="flex-1">{children}</main>
      <Footer />
      <FeedbackButton />
    </>
  );
}
