import { AppHeader } from '@/components/composition/AppHeader';
import { FeedbackButton } from '@/components/composition/FeedbackButton';
import { Footer } from '@/components/composition/Footer';

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
