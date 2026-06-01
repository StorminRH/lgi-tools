'use client';

import type { ReactNode } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { cn } from './cn';

// A floating, gapped, horizontally-scrolling Miller-column container. The
// primitive owns only layout (the row of columns + the gap between them) and
// the fan-in/out transition as the open path changes; each pane supplies its
// own content, so the container knows nothing about what it renders. Consumers
// drive the open path (which panes exist, in order) and rebuild `panes` as the
// selection changes — pair it with `useCascadePath` to keep that path in the
// URL. See `use-cascade-path.ts`.
//
// auto-animate observes the column row and animates columns as they're added,
// removed, or shifted — so opening a deeper column animates it in and collapsing
// the path animates it out, without any render-time ref/prev-key bookkeeping
// here. It applies motion via runtime JS (CSP-safe — not a static style
// attribute) and honours `prefers-reduced-motion`.

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
  const [parent] = useAutoAnimate<HTMLDivElement>();
  return (
    <div ref={parent} className={cn('cascade', className)}>
      {panes.map((pane) => (
        <div key={pane.key} className="cascade-col w-[360px]">
          {pane.label != null && <div className="cascade-col-label">{pane.label}</div>}
          {pane.content}
        </div>
      ))}
    </div>
  );
}
