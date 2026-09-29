import type { Metadata } from 'next';
import { ResearchBoard } from '@/features/industry-planner/components/ResearchBoard';

export const metadata: Metadata = {
  title: 'Market Research — Industry Planner',
  description:
    'Watch Eve Online products at Jita — sell and buy prices, spread, daily volume and a market score — before you plan a build.',
  alternates: { canonical: '/industry/research' },
};

export default function IndustryResearchPage() {
  return <ResearchBoard />;
}
