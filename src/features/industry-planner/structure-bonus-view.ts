// The hero structure-bonus readout's view logic (extracted from the component so
// the "which metrics to show" decision is unit-tested and the shell just maps
// over rows). `formatBonusPct` is the shared reduction-percent format used by
// both this readout and the applied-build-skills readout, so the two can't drift.

import type { StructureReadout } from './structure-factors';

/**
 * A reduction/bonus percent for the hero readouts: small values keep one
 * decimal, larger ones round to whole.
 */
export function formatBonusPct(n: number): string {
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
}

/**
 * One rendered row of the structure-bonus readout. `me`/`te`/`cost` are the
 * manufacturing bonuses; `rxn-te` is a lone-refinery build slot's reaction TE
 * (with a "rxn" marker only when it shares the line with manufacturing parts);
 * `tax` is the owner-entered facility tax (a cost, shown muted).
 */
export type StructureBonusRow =
  | { kind: 'me'; pct: string }
  | { kind: 'te'; pct: string }
  | { kind: 'cost'; pct: string }
  | { kind: 'rxn-te'; pct: string; withMarker: boolean }
  | { kind: 'tax'; taxPct: number };

/**
 * Which bonus rows a structure slot shows, in display order: only bonuses that
 * are actually positive, the reaction TE only when the slot hosts it, and the
 * tax only when the owner entered one (including a real 0%). An empty result
 * means the slot renders nothing.
 */
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
