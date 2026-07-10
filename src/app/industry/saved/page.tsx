import type { Metadata } from 'next';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SITE_URL } from '@/config/site-url';
import { SavedPlansManager } from '@/features/industry-planner/components/SavedPlansManager';

export const metadata: Metadata = {
  title: 'Saved Builds',
  description:
    'All your saved Eve Online build templates — load one into the industry planner, or rename, favorite, and prune the list.',
  alternates: { canonical: '/industry/saved' },
  openGraph: {
    title: 'Saved Builds — LGI.tools',
    description:
      'All your saved Eve Online build templates — load one into the industry planner, or rename, favorite, and prune the list.',
    url: `${SITE_URL}/industry/saved`,
    type: 'website',
    images: ['/logo.png'],
  },
};

// Fully static shell — the template list is a client island fetching
// /api/account/saved-plans on mount (an anonymous visitor settles to the
// sign-in hint via the client roster signal; no server session read here, so
// the page prerenders whole).
export default function SavedBuildsPage() {
  return (
    <PageShell>
      <PageHead
        crumb="industry/saved"
        title="Saved builds"
        subtitle="Load a template into the planner — favorites lead the list"
      />
      <div className="pb-16 max-w-[720px]">
        <SavedPlansManager />
      </div>
    </PageShell>
  );
}
