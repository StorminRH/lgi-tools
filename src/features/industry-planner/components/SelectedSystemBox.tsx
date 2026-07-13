import { formatSec } from '@/data/eve-data/systems-search';

// The picked/locked SYSTEM readout of a location group — the exact fixed box
// (260×30) the system search and the station select render at, so picking,
// locking, or clearing a system never shifts the hero card's plane. `locked`
// carries the locking structure's name (corp or pinned custom); a locked box
// shows a static marker instead of the Clear action. Both location groups
// share it so the two can't drift.
export function SelectedSystemBox({
  name,
  security,
  locked,
  onClear,
}: {
  name: string;
  security: number | null;
  locked?: string | null;
  onClear?: () => void;
}) {
  return (
    <div className="flex h-[30px] w-[260px] shrink-0 items-center gap-2 border border-border bg-bg px-2">
      <span className="min-w-0 truncate font-mono text-ui text-tone-blue">
        {name} {formatSec(security)}
      </span>
      {locked ? (
        <span
          title={`Locked to ${locked}`}
          className="ml-auto shrink-0 font-mono text-label uppercase tracking-wide text-muted"
        >
          locked
        </span>
      ) : onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto shrink-0 cursor-pointer text-label uppercase tracking-wide text-muted hover:text-text"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
