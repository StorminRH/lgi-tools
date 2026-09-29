'use client';

import { useMemo } from 'react';
import type { IndustryJob } from './esi-projection';
import { flattenJobs } from './flatten-jobs';
import { type SlotMetaModel, slotMetaTotals } from './slots';
import { useCorpJobsLive } from './use-corp-jobs-live';
import { useJobsLive } from './use-jobs-live';
import { useSlotsLive } from './use-slots-live';

export interface IndustryDesk {
  jobsLive: ReturnType<typeof useJobsLive>;
  corpLive: ReturnType<typeof useCorpJobsLive>;
  /** Every linked pilot's own jobs, soonest to finish first. */
  personalJobs: IndustryJob[];
  slots: SlotMetaModel | null;
}

/**
 * One read of the live industry feeds for a whole page. Each live hook fetches
 * on its own, so a page that shows jobs in two places reads them here once.
 */
export function useIndustryDesk(characterIds: number[], corpEligibleCharacterIds: number[]): IndustryDesk {
  const jobsLive = useJobsLive(characterIds);
  const corpLive = useCorpJobsLive(corpEligibleCharacterIds);
  const slotsLive = useSlotsLive();

  const personalJobs = useMemo(() => flattenJobs(jobsLive.jobsByCharacter.values()), [jobsLive.jobsByCharacter]);
  const slots = useMemo(
    () =>
      slotMetaTotals({
        loading: jobsLive.loading || corpLive.loading || slotsLive.loading,
        failed: jobsLive.failed || corpLive.failed,
        eligibleCharacterIds: characterIds,
        characters: slotsLive.characters,
        personalJobsByCharacter: jobsLive.jobsByCharacter,
        corpJobs: flattenJobs(corpLive.corporations),
      }),
    [
      characterIds,
      jobsLive.loading,
      jobsLive.failed,
      jobsLive.jobsByCharacter,
      corpLive.loading,
      corpLive.failed,
      corpLive.corporations,
      slotsLive.loading,
      slotsLive.characters,
    ],
  );

  return { jobsLive, corpLive, personalJobs, slots };
}
