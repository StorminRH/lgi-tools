import { cn } from './ui/cn';
import { TypeIcon } from './type-icon';

/**
 * The 40px tile a structure or station row leads with when there is no icon to
 * show: a short label in its frame. Callers set the label's type size.
 */
export function PlaceholderTile({ label, className }: { label: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-ctl border border-border bg-bg-deep/60 font-display font-bold text-muted',
        className,
      )}
    >
      {label}
    </span>
  );
}

/** A structure's hull as its CCP type icon, or a blank tile until the hull is known. */
export function StructureHullTile({ typeId, hullName }: { typeId: number | null; hullName: string | null }) {
  if (typeId === null) return <PlaceholderTile label="?" className="text-nav" />;
  return <TypeIcon typeId={typeId} size={40} mono={hullName ?? undefined} />;
}
