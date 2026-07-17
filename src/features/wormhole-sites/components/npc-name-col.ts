import { useEffect, type RefObject } from 'react';

const LEAD_COL = 44; // the 44px hull-class/count column
const COL_GAPS = 18; // three 6px gaps between the four columns
const ROW_PADDING = 28; // px-3.5 on each side of the wave grid
const NAME_BUFFER = 10; // clear gap between the longest name and the EWAR chips
const MIN_NAME = 40;

/**
 * One measured NPC row: the name width, the combined EWAR+DPS trailing width,
 * and the usable grid content width (Infinity when the grid wasn't found).
 */
export type NpcRowMetrics = { name: number; trailing: number; gridContent: number };

/**
 * The shared name-column width: the widest NPC name (+ buffer), but clamped so
 * the busiest row (widest EWAR + DPS) still fits the narrowest grid — otherwise a
 * fixed name column would overflow EWAR-heavy waves and shove their DPS out of
 * line. Returns null when nothing measurable was found (fall back to auto sizing).
 */
export function deriveNpcNameColWidth(rows: NpcRowMetrics[]): number | null {
  let maxName = 0;
  let maxTrailing = 0;
  let gridContent = Infinity;
  for (const row of rows) {
    if (row.name > maxName) maxName = row.name;
    if (row.trailing > maxTrailing) maxTrailing = row.trailing;
    gridContent = Math.min(gridContent, row.gridContent);
  }
  if (maxName <= 0 || !Number.isFinite(gridContent)) return null;
  const available = gridContent - LEAD_COL - COL_GAPS - maxTrailing;
  return Math.round(Math.max(MIN_NAME, Math.min(maxName + NAME_BUFFER, available)));
}

function elWidth(el: Element | undefined): number {
  return (el as HTMLElement | undefined)?.offsetWidth ?? 0;
}

function readNpcRow(nameEl: HTMLElement): NpcRowMetrics {
  const row = nameEl.parentElement;
  const grid = row?.parentElement;
  return {
    name: nameEl.offsetWidth,
    trailing: elWidth(row?.children[2]) + elWidth(row?.children[3]),
    gridContent: grid ? grid.clientWidth - ROW_PADDING : Infinity,
  };
}

/**
 * Measures every `[data-npc-name]` cell under `ref` and writes the derived shared
 * name-column width to `--npc-name-col`, so the EWAR chips line up across the
 * whole expansion and the DPS column pegs to one right edge. Runs on the next
 * frame (past the initial layout, so the first painted frame is aligned) and
 * re-runs once webfonts swap in (real-font names are wider than the fallback).
 */
export function useNpcNameColScope(ref: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      const root = ref.current;
      if (!root || cancelled) return; // bail if unmounted (e.g. fonts.ready resolves late)
      // Force full-width names just for the measurement so offsetWidth is the real
      // name width, not whatever a constrained column clamped it to.
      root.style.setProperty('--npc-name-col', 'max-content');
      const rows = [...root.querySelectorAll<HTMLElement>('[data-npc-name]')].map(readNpcRow);
      const width = deriveNpcNameColWidth(rows);
      if (width != null) root.style.setProperty('--npc-name-col', `${width}px`);
    };
    const raf = requestAnimationFrame(measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [ref]);
}
