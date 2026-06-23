'use client';

import { useEffect, useRef, type ReactNode } from 'react';

const LEAD_COL = 44; // the 44px hull-class/count column
const COL_GAPS = 18; // three 6px gaps between the four columns
const ROW_PADDING = 28; // px-3.5 on each side of the wave grid
const NAME_BUFFER = 10; // clear gap between the longest name and the EWAR chips
const MIN_NAME = 40;

/**
 * Sets `--npc-name-col` to one shared name-column width for every wave so the
 * EWAR chips line up across the whole expansion AND the DPS column stays pegged to
 * one right edge. The width is the widest NPC name, but capped so the busiest row
 * (widest EWAR + DPS) still fits the card — otherwise a fixed name column would
 * overflow the narrow card on EWAR-heavy waves and shove their DPS out of line.
 * Measured on the client (widths depend on the rendered font); until it runs (and
 * in the table view, which doesn't use it) the grids fall back to per-wave auto
 * sizing. `display: contents` so the wrapper adds no box; the custom property
 * still cascades to the descendant grids.
 */
export function NpcNameColScope({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      // Force full-width names just for the measurement so offsetWidth is the
      // real name width, not whatever a constrained column clamped it to.
      root.style.setProperty('--npc-name-col', 'max-content');
      let maxName = 0;
      let maxTrailing = 0;
      let gridContent = Infinity;
      root.querySelectorAll<HTMLElement>('[data-npc-name]').forEach((nameEl) => {
        if (nameEl.offsetWidth > maxName) maxName = nameEl.offsetWidth;
        const row = nameEl.parentElement;
        if (!row) return;
        const ewar = (row.children[2] as HTMLElement | undefined)?.offsetWidth ?? 0;
        const dps = (row.children[3] as HTMLElement | undefined)?.offsetWidth ?? 0;
        if (ewar + dps > maxTrailing) maxTrailing = ewar + dps;
        const grid = row.parentElement;
        if (grid) gridContent = Math.min(gridContent, grid.clientWidth - ROW_PADDING);
      });
      if (maxName <= 0 || !Number.isFinite(gridContent)) return;
      const available = gridContent - LEAD_COL - COL_GAPS - maxTrailing;
      const nameCol = Math.max(MIN_NAME, Math.min(maxName + NAME_BUFFER, available));
      root.style.setProperty('--npc-name-col', `${Math.round(nameCol)}px`);
    };
    // Defer the first measure to the next frame: when this lives inside the
    // lightbox, this child effect runs BEFORE the Modal's effect calls
    // showModal(), so the dialog is still display:none and every width is 0. A
    // rAF runs after that parent effect (and before paint), so the dialog is
    // shown and the first paint is already aligned — no visible snap.
    const raf = requestAnimationFrame(measure);
    // Re-measure once webfonts swap in — names are wider in the real font than the
    // fallback, and a column locked to the fallback width would clip them.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
