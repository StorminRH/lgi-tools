'use client';

import { ProfileWorkspace } from '@/components/composition/industry-workspace/ProfileWorkspace';
import { useCorpJobsLive } from '@/features/industry-jobs/use-corp-jobs-live';
import { useJobsLive } from '@/features/industry-jobs/use-jobs-live';

/**
 * The industry landing: the production profile workspace. The personal and
 * corporation job feeds that its slot usage reads are fetched once here.
 */
export function IndustryLanding({
  characterIds,
  corpEligibleCharacterIds,
}: {
  characterIds: number[];
  corpEligibleCharacterIds: number[];
}) {
  const jobsLive = useJobsLive(characterIds);
  const corpLive = useCorpJobsLive(corpEligibleCharacterIds);
  return (
    <ProfileWorkspace jobs={jobsLive} corp={corpLive} corpEligible={corpEligibleCharacterIds.length > 0} />
  );
}
