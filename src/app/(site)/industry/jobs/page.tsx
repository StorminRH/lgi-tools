import type { Metadata } from 'next';
import { Suspense } from 'react';
import { IndustrySection } from '@/components/composition/industry-workspace/IndustryShell';
import { JobsContent, JobsLoading } from './JobsContent';

export const metadata: Metadata = {
  title: 'Active Jobs — Industry Planner',
  description: 'Your Eve Online industry jobs across every linked character and corporation, live as they run.',
  alternates: { canonical: '/industry/jobs' },
};

export default function IndustryJobsPage() {
  return (
    <IndustrySection>
      <h1 className="sr-only">Active jobs</h1>
      <Suspense fallback={<JobsLoading />}>
        <JobsContent />
      </Suspense>
    </IndustrySection>
  );
}
