import type { Metadata } from 'next';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SITE_URL } from '@/config/site-url';
import { SavedPlansManager } from '@/features/industry-planner/components/SavedPlansManager';

export const metadata: Metadata = {
  title: 'Build Templates',
  description:
    'All your saved Eve Online build templates — load one into the industry planner, or rename, favorite, and prune the list.',
  alternates: { canonical: '/industry/templates' },
  openGraph: {
    title: 'Build Templates — LGI.tools',
    description:
      'All your saved Eve Online build templates — load one into the industry planner, or rename, favorite, and prune the list.',
    url: `${SITE_URL}/industry/templates`,
    type: 'website',
    images: ['/logo.png'],
  },
};

export default function BuildTemplatesPage() {
  return (
    <PageShell mode="reading">
      <PageHead
        crumb="industry/templates"
        title="Templates"
        subtitle="Load a template into the planner — favorites lead the list"
      />
      <div className="pb-16">
        <SavedPlansManager />
      </div>

    </PageShell>

  );
}
