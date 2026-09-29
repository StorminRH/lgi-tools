'use client';

import type { ReactNode } from 'react';
import { ProfileWorkspace } from '@/components/composition/industry-workspace/ProfileWorkspace';
import { useCorpJobsLive } from '@/features/industry-jobs/use-corp-jobs-live';
import { useJobsLive } from '@/features/industry-jobs/use-jobs-live';
import { IndustryDashboardGrid } from './IndustryDashboardGrid';

/**
 * The industry landing: production profiles first, then recent blueprints,
 * templates and jobs. Both read the same personal and corporation job feeds,
 * fetched once here.
 */
export function IndustryLanding({
  characterIds,
  corpEligibleCharacterIds,
  hasLinkedCharacters,
  reconnectAction,
}: {
  characterIds: number[];
  corpEligibleCharacterIds: number[];
  hasLinkedCharacters: boolean;
  reconnectAction: ReactNode;
}) {
  const jobsLive = useJobsLive(characterIds);
  const corpLive = useCorpJobsLive(corpEligibleCharacterIds);
  return (
    <>
      <ProfileWorkspace
        jobs={jobsLive}
        corp={corpLive}
        corpEligible={corpEligibleCharacterIds.length > 0}
      />
      <IndustryDashboardGrid
        jobsLive={jobsLive}
        corpLive={corpLive}
        corpEligibleCharacterIds={corpEligibleCharacterIds}
        hasLinkedCharacters={hasLinkedCharacters}
        reconnectAction={reconnectAction}
      />
    </>
  );
}
