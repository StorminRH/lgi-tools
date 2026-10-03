import { cn } from '@/components/ui/cn';
import { SDE_CITADEL_GROUP_ID, SDE_REFINERY_GROUP_ID } from '@/data/eve-data/constants';

const TONE: Record<number, string> = {
  [SDE_REFINERY_GROUP_ID]: 'border-reaction-purple/30 bg-reaction-purple/10 text-tone-purple',
  [SDE_CITADEL_GROUP_ID]: 'border-border-active bg-row-on text-text',
};
const ENGINEERING_TONE = 'border-isk/25 bg-isk/[0.07] text-isk';

/** A structure's hull as a two-letter tile, toned by what the hull can run. */
export function StructureHullTile({ hullName, groupId }: { hullName: string | null; groupId: number | null }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-ctl border font-display text-nav font-bold tracking-copy',
        (groupId !== null && TONE[groupId]) || ENGINEERING_TONE,
      )}
    >
      {hullName ? hullName.slice(0, 2) : '?'}
    </span>
  );
}
