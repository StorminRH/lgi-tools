import type { ReactNode } from 'react';
import { cn } from './cn';

// A floating, gapped, horizontally-scrolling Miller-column container. The
// primitive owns only layout (the row of columns + the gap between them) and
// the pop-in transition as the open path grows; each pane supplies its own
// content, so the container knows nothing about what it renders. Consumers
// drive the open path (which panes exist, in order) and rebuild `panes` as the
// selection changes — pair it with `useCascadePath` to keep that path in the
// URL. See `use-cascade-path.ts`.
//
// The fan-in animation is pure CSS keyed off DOM insertion (`.cascade-col` in
// globals.css), so a newly-opened column animates while the columns already on
// screen don't replay — no render-time bookkeeping needed here.

export interface CascadePane {
  // Stable identity for the pane (also its URL-path segment) → the React key,
  // so a sibling swap remounts (and re-animates) the column.
  key: string;
  label?: ReactNode;
  content: ReactNode;
}

export function CascadingPanels({
  panes,
  className,
}: {
  panes: CascadePane[];
  className?: string;
}) {
  return (
    <div className={cn('cascade', className)}>
      {panes.map((pane) => (
        <div key={pane.key} className="cascade-col w-[360px]">
          {pane.label != null && <div className="cascade-col-label">{pane.label}</div>}
          {pane.content}
        </div>
      ))}
    </div>
  );
}
