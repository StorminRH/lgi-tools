'use client';

// The /industry header's used-slot counts (handoff §5): manufacturing /
// science / reactions, with the numbers in EVE-industry-blue. Derived from the
// same live `forViewer` jobs query the Active-jobs table reads (Convex dedupes
// the subscription); this one only reads — the table drives the sync. Renders
// nothing when signed out or before Convex is configured.
import { Authenticated, useQuery } from 'convex/react';
import { useMemo } from 'react';
import { api } from '@/data/convex/api';
import { convexClient } from '@/data/convex/client';
import { jobCategory, type JobCategory } from '../industry-jobs-styles';

export function IndustrySlotMeta() {
  if (convexClient === null) return null;
  return (
    <Authenticated>
      <SlotMetaInner />
    </Authenticated>
  );
}

function SlotMetaInner() {
  const live = useQuery(api.industryJobs.forViewer);
  const counts = useMemo(() => {
    const tally: Record<JobCategory, number> = { manufacturing: 0, science: 0, reactions: 0 };
    for (const character of live?.characters ?? []) {
      for (const job of character.data?.jobs ?? []) {
        const category = jobCategory(job.activity_id);
        if (category) tally[category] += 1;
      }
    }
    return tally;
  }, [live]);

  if (!live) return null;

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
