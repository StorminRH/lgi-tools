import { useEffect, type RefObject } from 'react';

const LEAD_COL = 44;
const COL_GAPS = 18;
const ROW_PADDING = 28;
const NAME_BUFFER = 10;
const MIN_NAME = 40;

export type NpcRowMetrics = { name: number; trailing: number; gridContent: number };

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

export function useNpcNameColScope(ref: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      const root = ref.current;
      if (!root || cancelled) return;

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
