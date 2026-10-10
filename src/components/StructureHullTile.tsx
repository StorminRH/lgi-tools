import { TypeIcon } from './type-icon';

/** A structure's hull as its CCP type icon, or a blank tile until the hull is known. */
export function StructureHullTile({ typeId, hullName }: { typeId: number | null; hullName: string | null }) {
  if (typeId === null) {
    return (
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-ctl border border-border bg-bg-deep/60 font-display text-nav font-bold text-muted"
      >
        ?
      </span>
    );
  }
  return <TypeIcon typeId={typeId} size={40} mono={hullName ?? undefined} />;
}
