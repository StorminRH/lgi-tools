'use client';

// The /industry header's slot readout (reworked 3.7.24): used/total per
// activity — manufacturing / science / reactions — summed across ALL the
// viewer's characters. Capacity comes from /api/account/industry-slots (1 base
// + the two slot skills per activity, base 1/1/1 fail-open for a character
// with no synced skills); usage counts each character's personal board plus
// the corp jobs they INSTALLED (how the game charges slots), deduped by
// job_id. The jobs reads are the same on-view reads the section grid uses (the
// duplicate fetches dedup against the 300s server staleness gates — the
// established pattern); all the branching lives in slotMetaTotals (slots.ts).
// Renders nothing until every feed lands, or when the viewer has no characters
// (signed out / none linked).
import { useMemo } from 'react';
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
        characters: slotsLive.characters,
        personalJobsByCharacter: jobsLive.jobsByCharacter,
        corpJobs: flattenJobs(corpLive.corporations),
      }),
    [
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
      <span>
        manufacturing{' '}
        <b className="text-evb-bright font-semibold">
          {model.manufacturing.used}/{model.manufacturing.total}
        </b>
      </span>
      <span>
        science{' '}
        <b className="text-evb-bright font-semibold">
          {model.science.used}/{model.science.total}
        </b>
      </span>
      <span>
        reactions{' '}
        <b className="text-evb-bright font-semibold">
          {model.reactions.used}/{model.reactions.total}
        </b>
      </span>
    </>
  );
}
