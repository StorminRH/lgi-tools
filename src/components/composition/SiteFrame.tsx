import { AppHeader } from '@/components/composition/AppHeader';
import { FeedbackButton } from '@/components/composition/FeedbackButton';
import { Footer } from '@/components/composition/Footer';

/**
 * The site chrome frame: header, main region, footer, and feedback affordance.
 * Owned here rather than in the (site) layout because the root not-found file
 * must render identical chrome and cannot live inside the group — Next routes
 * every unmatched URL to the root file.
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
