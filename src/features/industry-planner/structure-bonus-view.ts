import type { StructureReadout } from './structure-factors';

export function formatBonusPct(n: number): string {
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
}

export type StructureBonusRow =
  | { kind: 'me'; pct: string }
  | { kind: 'te'; pct: string }
  | { kind: 'cost'; pct: string }
  | { kind: 'rxn-te'; pct: string; withMarker: boolean }
  | { kind: 'tax'; taxPct: number };

export function structureBonusRows(
  readout: StructureReadout,
  taxPct?: number | null,
): StructureBonusRow[] {
  const mfg = readout.mfg;
  const rxnTe = readout.rxn && readout.rxn.te > 0 ? readout.rxn.te : null;
  const tax = taxPct ?? null;
  const rows: StructureBonusRow[] = [];
  if (mfg !== null && mfg.me > 0) rows.push({ kind: 'me', pct: formatBonusPct(mfg.me) });
  if (mfg !== null && mfg.te > 0) rows.push({ kind: 'te', pct: formatBonusPct(mfg.te) });
  if (mfg !== null && mfg.costBonus > 0) rows.push({ kind: 'cost', pct: formatBonusPct(mfg.costBonus) });
  if (rxnTe !== null) rows.push({ kind: 'rxn-te', pct: formatBonusPct(rxnTe), withMarker: mfg !== null });
  if (tax !== null) rows.push({ kind: 'tax', taxPct: tax });
  return rows;
}
