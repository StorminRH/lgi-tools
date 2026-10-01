'use client';

import type { JobCategory } from '@/features/industry-jobs/industry-jobs-styles';
import type { FacilityRef, ProfileDocument } from '@/features/industry-planner/profiles/profile-document';
import type { AvailableStructure } from '@/features/industry-planner/types';
import { KpiTile } from '../board/board-bits';
import { SectionPanel } from '../board/SectionBody';
import { FacilityPicker } from './FacilityPicker';
import { freeSlots, type PoolSummary, type ProfileSummary as Summary, SLOT_POOLS } from './workspace-model';

const POOL_LABELS: Record<JobCategory, string> = {
  manufacturing: 'Manufacturing slots',
  reactions: 'Reaction slots',
  science: 'Science slots',
};

/**
 * Used over capacity when usage is known; capacity alone otherwise. "+" marks
 * capacity still syncing, and "?" a pool no one's skills have synced for yet.
 */
export function poolFigure(pool: PoolSummary): string {
  const unknownAll = pool.unknownCapacity > 0 && pool.capacity === 0;
  const capacity = unknownAll ? '?' : pool.unknownCapacity > 0 ? `${pool.capacity}+` : String(pool.capacity);
  return pool.unknownUsed > 0 || unknownAll ? capacity : `${pool.used}/${capacity}`;
}

function poolNote(pool: PoolSummary): string {
  const free = freeSlots(pool);
  if (free !== null) return `${free} free`;
  if (pool.unknownCapacity > 0 && pool.capacity === 0) return 'Skills syncing';
  if (pool.unknownUsed > 0) return 'In use unknown';
  return `${pool.used} in use · skills syncing`;
}

/** One readout per slot pool. Callers wrap them in a `<dl>`. */
export function PoolTiles({ pools }: { pools: Record<JobCategory, PoolSummary> }) {
  return SLOT_POOLS.map((pool) => (
    <KpiTile
      key={pool}
      label={POOL_LABELS[pool]}
      note={poolNote(pools[pool])}
      noteTone={freeSlots(pools[pool]) === null ? 'text-muted' : 'text-isk'}
    >
      {poolFigure(pools[pool])}
    </KpiTile>
  ));
}

export function SummaryTiles({ summary }: { summary: Summary }) {
  const covered = summary.coverage.filter((c) => c.resolution.status === 'assigned').length;
  const unlinked = summary.unlinkedMembers.length;
  const missing = summary.missingFacilities.length;
  return (
    <dl aria-label="Profile summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <KpiTile
        label="Members"
        note={unlinked > 0 ? `${unlinked} not linked` : undefined}
        noteTone="text-dps-mid"
      >
        {summary.memberCount}
      </KpiTile>
      <KpiTile
        label="Covered"
        note={covered < summary.coverage.length ? 'Some jobs unassigned' : 'Every responsibility'}
        noteTone={covered < summary.coverage.length ? 'text-dps-mid' : 'text-isk'}
      >
        {covered}/{summary.coverage.length}
      </KpiTile>
      <KpiTile
        label="Facilities"
        note={missing > 0 ? `${missing} unavailable` : undefined}
        noteTone="text-dps-mid"
      >
        {summary.facilityCount}
      </KpiTile>
      <PoolTiles pools={summary.pools} />
    </dl>
  );
}

/** The profile-wide fallbacks for a responsibility that has no facility of its own. */
export function DefaultFacilitiesPanel({
  doc,
  structures,
  onDefault,
}: {
  doc: ProfileDocument;
  structures: readonly AvailableStructure[] | null;
  onDefault: (activity: 'manufacturing' | 'reactions', next: FacilityRef | null) => void;
}) {
  return (
    <SectionPanel title="Default facilities">
      <div className="flex flex-col gap-2 px-3.5 py-3">
        <span className="text-micro text-faint">Used when a responsibility has no facility of its own.</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span aria-hidden className="text-micro text-muted">Manufacturing</span>
            <FacilityPicker
              label="Default manufacturing facility"
              value={doc.defaults.manufacturingFacility}
              structures={structures}
              activity="manufacturing"
              noneLabel="None"
              onChange={(next) => onDefault('manufacturing', next)}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span aria-hidden className="text-micro text-muted">Reactions</span>
            <FacilityPicker
              label="Default reaction facility"
              value={doc.defaults.reactionFacility}
              structures={structures}
              activity="reactions"
              noneLabel="None"
              onChange={(next) => onDefault('reactions', next)}
            />
          </div>
        </div>
      </div>
    </SectionPanel>
  );
}
