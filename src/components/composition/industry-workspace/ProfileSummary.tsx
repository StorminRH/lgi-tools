'use client';

import { Button } from '@/components/ui/button';
import type { FacilityRef, ProfileDocument } from '@/features/industry-planner/profiles/profile-document';
import type { AvailableStructure } from '@/features/industry-planner/types';
import { SectionPanel } from '../board/SectionBody';
import { FacilityPicker } from './FacilityPicker';
import { setStructuresPanelOpen } from './structures-panel';
import type { PoolSummary } from './workspace-model';

/**
 * Used over capacity when usage is known; capacity alone otherwise. "+" marks
 * capacity still syncing, and "?" a pool no one's skills have synced for yet.
 */
export function poolFigure(pool: PoolSummary): string {
  const unknownAll = pool.unknownCapacity > 0 && pool.capacity === 0;
  const capacity = unknownAll ? '?' : pool.unknownCapacity > 0 ? `${pool.capacity}+` : String(pool.capacity);
  return pool.unknownUsed > 0 || unknownAll ? capacity : `${pool.used}/${capacity}`;
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
    <SectionPanel
      title="Default facilities"
      meta={
        <Button
          variant="bare"
          data-structures-trigger
          aria-haspopup="dialog"
          className="whitespace-nowrap font-ui text-micro font-normal uppercase tracking-eyebrow text-isk no-underline transition-colors hover:text-name"
          onClick={() => setStructuresPanelOpen(true)}
        >
          Structures →
        </Button>
      }
    >
      <div className="flex flex-col gap-2 px-3.5 py-3">
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
