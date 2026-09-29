import type { Metadata } from 'next';
import { SITE_URL } from '@/config/site-url';
import { TemplatesBoard } from '@/features/industry-planner/components/TemplatesBoard';

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
  return <TemplatesBoard />;
}
