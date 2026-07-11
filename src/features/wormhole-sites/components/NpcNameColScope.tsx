'use client';

import { useRef, type ReactNode } from 'react';
import { useNpcNameColScope } from './npc-name-col';

/**
 * Sets `--npc-name-col` to one shared name-column width for every wave so the
 * EWAR chips line up across the whole expansion AND the DPS column stays pegged to
 * one right edge (the measure + clamp live in {@link useNpcNameColScope}). Until it
 * runs on the client — and in the table view, which doesn't use it — the grids fall
 * back to per-wave auto sizing. `display: contents` so the wrapper adds no box; the
 * custom property still cascades to the descendant grids.
 */
export function NpcNameColScope({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useNpcNameColScope(ref);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
