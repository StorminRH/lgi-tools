'use client';

// The /industry header's used-slot counts (MIGRATE.B.2): manufacturing / science /
// reactions, with the numbers in EVE-industry-blue. Derived from the same on-view jobs
// read the Active-jobs table uses (/api/account/industry-jobs, a Neon stale-gated on-view
// read; the two fetches dedup against the 300s staleness gate). This one only reads — it
// renders nothing until the read lands, or when the viewer has no characters (signed out
// / none linked, so the on-view read returns an empty roster).
import { useMemo } from 'react';
import { jobCategory, type JobCategory } from '../industry-jobs-styles';
import { useJobsLive } from '../use-jobs-live';

export function IndustrySlotMeta({ characterIds }: { characterIds: number[] }) {
  const { jobsByCharacter, loading } = useJobsLive(characterIds);
  const counts = useMemo(() => {
    const tally: Record<JobCategory, number> = { manufacturing: 0, science: 0, reactions: 0 };
    for (const live of jobsByCharacter.values()) {
      for (const job of live.data?.jobs ?? []) {
        const category = jobCategory(job.activity_id);
        if (category) tally[category] += 1;
      }
    }
    return tally;
  }, [jobsByCharacter]);

  if (loading || jobsByCharacter.size === 0) return null;

  return (
    <>
      <span>
        manufacturing <b className="text-evb-bright font-semibold">{counts.manufacturing}</b>
      </span>
      <span>
        science <b className="text-evb-bright font-semibold">{counts.science}</b>
      </span>
      <span>
        reactions <b className="text-evb-bright font-semibold">{counts.reactions}</b>
      </span>
    </>
  );
}
