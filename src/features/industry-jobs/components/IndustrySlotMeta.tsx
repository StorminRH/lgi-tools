'use client';

import { useMemo } from 'react';
import { eyebrow } from '@/components/ui/type-roles';
import { flattenJobs } from '../flatten-jobs';
import { slotMetaTotals } from '../slots';
import { useCorpJobsLive } from '../use-corp-jobs-live';
import { useJobsLive } from '../use-jobs-live';
import { useSlotsLive } from '../use-slots-live';

export function IndustrySlotMeta({
  characterIds,
  corpEligibleCharacterIds,
}: {
  characterIds: number[];
  corpEligibleCharacterIds: number[];
}) {
  const jobsLive = useJobsLive(characterIds);
  const corpLive = useCorpJobsLive(corpEligibleCharacterIds);
  const slotsLive = useSlotsLive();

  const model = useMemo(
    () =>
      slotMetaTotals({
        loading: jobsLive.loading || corpLive.loading || slotsLive.loading,
        eligibleCharacterIds: characterIds,
        characters: slotsLive.characters,
        personalJobsByCharacter: jobsLive.jobsByCharacter,
        corpJobs: flattenJobs(corpLive.corporations),
      }),
    [
      characterIds,
      jobsLive.loading,
      jobsLive.jobsByCharacter,
      corpLive.loading,
      corpLive.corporations,
      slotsLive.loading,
      slotsLive.characters,
    ],
  );

  if (model === null) return null;

  return (
    <>
      <span className={eyebrow()}>
        manufacturing{' '}
        <b className="text-evb-bright font-semibold">
          {model.manufacturing.used}/{model.manufacturing.total}
        </b>
      </span>
      <span className={eyebrow()}>
        science{' '}
        <b className="text-evb-bright font-semibold">
          {model.science.used}/{model.science.total}
        </b>
      </span>
      <span className={eyebrow()}>
        reactions{' '}
        <b className="text-evb-bright font-semibold">
          {model.reactions.used}/{model.reactions.total}
        </b>
      </span>
    </>
  );
}
