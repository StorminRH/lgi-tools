import { formatPct } from '@/lib/format/number';
import type { StructureReadout } from './structure-factors';

// `pct` is formatPct's one decimal at every size, as the game's industry tooltips show bonuses; the math keeps full precision.
export type StructureBonusRow =
  | { kind: 'me'; pct: string }
  | { kind: 'te'; pct: string }
  | { kind: 'cost'; pct: string }
  | { kind: 'rxn-me'; pct: string; withMarker: boolean }
  | { kind: 'rxn-te'; pct: string; withMarker: boolean }
  | { kind: 'tax'; taxPct: number };

function reactionRows(readout: StructureReadout): StructureBonusRow[] {
  const rxn = readout.rxn;
  if (rxn === null) return [];
  const rows: StructureBonusRow[] = [];
  const marker = () => readout.mfg !== null && rows.length === 0;
  if (rxn.me > 0) rows.push({ kind: 'rxn-me', pct: formatPct(rxn.me), withMarker: marker() });
  if (rxn.te > 0) rows.push({ kind: 'rxn-te', pct: formatPct(rxn.te), withMarker: marker() });
  return rows;
}

function structureBonusRows(
  readout: StructureReadout,
  taxPct?: number | null,
): StructureBonusRow[] {
  const mfg = readout.mfg;
  const tax = taxPct ?? null;
  const rows: StructureBonusRow[] = [];
  if (mfg !== null && mfg.me > 0) rows.push({ kind: 'me', pct: formatPct(mfg.me) });
  if (mfg !== null && mfg.te > 0) rows.push({ kind: 'te', pct: formatPct(mfg.te) });
  if (mfg !== null && mfg.costBonus > 0) rows.push({ kind: 'cost', pct: formatPct(mfg.costBonus) });
  rows.push(...reactionRows(readout));
  if (tax !== null) rows.push({ kind: 'tax', taxPct: tax });
  return rows;
}

export interface BonusColumnLine {
  reactions: boolean;
  /** Material, time, job cost and tax, in that order; null where the line has none. */
  cells: [StructureBonusRow | null, StructureBonusRow | null, StructureBonusRow | null, StructureBonusRow | null];
}

/**
 * The readout as fixed columns, so a list of structures lines up: manufacturing
 * on one line, reactions under it, and tax on whichever line comes first.
 */
export function structureBonusColumns(readout: StructureReadout, taxPct?: number | null): BonusColumnLine[] {
  const rows = structureBonusRows(readout, taxPct);
  const cell = (kind: StructureBonusRow['kind']) => rows.find((r) => r.kind === kind) ?? null;
  const both: BonusColumnLine[] = [
    { reactions: false, cells: [cell('me'), cell('te'), cell('cost'), null] },
    { reactions: true, cells: [cell('rxn-me'), cell('rxn-te'), null, null] },
  ];
  const lines = both.filter((line) => line.cells.some((c) => c !== null));
  const tax = cell('tax');
  if (tax === null) return lines;
  const [first, ...rest] = lines;
  if (!first) return [{ reactions: false, cells: [null, null, null, tax] }];
  return [{ ...first, cells: [first.cells[0], first.cells[1], first.cells[2], tax] }, ...rest];
}
