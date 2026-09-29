import type { Metadata } from 'next';
import { SITE_URL } from '@/config/site-url';
import { LedgerResearch } from '@/features/industry-planner/components/research/ledger/LedgerResearch';

export const metadata: Metadata = {
  title: 'Industry Planner',
  description:
    'Research what to build in Eve Online — Jita price history, demand, profit odds and a build confidence score for every product you watch — then plan the build, follow the jobs and keep templates.',
  alternates: { canonical: '/industry' },
  openGraph: {
    title: 'Industry Planner — LGI.tools',
    description:
      'Research what’s worth building in Eve Online: Jita price history, demand, profit odds and build confidence, then plan it at live rates.',
    url: `${SITE_URL}/industry`,
    type: 'website',
    images: ['/logo.png'],
  },
};

export default function IndustryResearchPage() {
  return <LedgerResearch />;
}
