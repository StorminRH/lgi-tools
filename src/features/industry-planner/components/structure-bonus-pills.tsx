'use client';

import { Pill } from '@/components/ui/pill';
import type { StructureBonus } from '../structure-bonus';
import type { StructureReadout } from '../structure-factors';

// A reduction percent for the structure-bonus readout — small values keep a decimal.
function pct(n: number): string {
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
}

// The manufacturing-side bonus parts (a Refinery / Citadel may contribute none).
function manufacturingParts(b: StructureBonus): string[] {
  const parts: string[] = [];
  if (b.me > 0) parts.push(`ME −${pct(b.me)}`);
  if (b.te > 0) parts.push(`TE −${pct(b.te)}`);
  if (b.costBonus > 0) parts.push(`Cost −${pct(b.costBonus)}`);
  return parts;
}

// A structure slot's green readout pills — a Mfg pill for its manufacturing
// contribution and a Rxn pill for its reaction contribution (reactions are time-only).
// The slot passes only the bonuses it actually hosts, so pills never double up across
// the two slots.
export function StructureBonusPills({ readout }: { readout: StructureReadout }) {
  const mfg = readout.mfg ? manufacturingParts(readout.mfg) : [];
  const rxn = readout.rxn && readout.rxn.te > 0 ? [`TE −${pct(readout.rxn.te)}`] : [];
  return (
    <>
      {mfg.length > 0 && <Pill tone="green">Mfg {mfg.join(' · ')}</Pill>}
      {rxn.length > 0 && <Pill tone="green">Rxn {rxn.join(' · ')}</Pill>}
    </>
  );
}
