import type { StructureReadout } from './structure-factors';

export function formatBonusPct(n: number): string {
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
}

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
  if (rxn.me > 0) rows.push({ kind: 'rxn-me', pct: formatBonusPct(rxn.me), withMarker: marker() });
  if (rxn.te > 0) rows.push({ kind: 'rxn-te', pct: formatBonusPct(rxn.te), withMarker: marker() });
  return rows;
}

export function structureBonusRows(
  readout: StructureReadout,
  taxPct?: number | null,
): StructureBonusRow[] {
  const mfg = readout.mfg;
  const tax = taxPct ?? null;
  const rows: StructureBonusRow[] = [];
  if (mfg !== null && mfg.me > 0) rows.push({ kind: 'me', pct: formatBonusPct(mfg.me) });
  if (mfg !== null && mfg.te > 0) rows.push({ kind: 'te', pct: formatBonusPct(mfg.te) });
  if (mfg !== null && mfg.costBonus > 0) rows.push({ kind: 'cost', pct: formatBonusPct(mfg.costBonus) });
  rows.push(...reactionRows(readout));
  if (tax !== null) rows.push({ kind: 'tax', taxPct: tax });
  return rows;
}
