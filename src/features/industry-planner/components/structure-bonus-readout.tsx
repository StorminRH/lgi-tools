'use client';

import type { ReactNode } from 'react';
import { GemIcon, HourglassIcon } from './MeAdjuster';
import type { StructureBonus } from '../structure-bonus';
import type { StructureReadout } from '../structure-factors';

// A reduction percent for the structure-bonus readout — small values keep a decimal.
function pct(n: number): string {
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
}

// One glyph + percent pair — the gem/hourglass stand in for the old "Mfg ME/TE"
// words, in their ISK-green bonus tone.
function Metric({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1 font-mono text-[10px] leading-none text-isk">
      <span aria-hidden className="inline-flex h-3 w-3 shrink-0">
        {icon}
      </span>
      −{value}
    </span>
  );
}

// A structure slot's compact bonus readout (3.7.13.2 hero rework): the ME gem and
// TE hourglass with bare percents, replacing the wordy green pills that pushed the
// hero's controls around. Renders inside a fixed-height slot the selectors reserve,
// so a bonus appearing or vanishing never reflows the card. The slot passes only
// the bonuses it actually hosts, so readouts never double up across the two slots;
// the reaction contribution gets a tiny "rxn" marker only when it shares the line
// with manufacturing parts (a lone-refinery build slot hosts both).
//
// `taxPct` is the slot structure's owner-ENTERED facility tax (3.7.13.3), shown
// muted — a tax is a cost, not a bonus. Rendered only when entered (including a
// real 0%); the unset 0.25%-assumed baseline stays out of the hero and lives in
// the fee-breakdown hover instead.
export function StructureBonusReadout({
  readout,
  taxPct,
}: {
  readout: StructureReadout;
  taxPct?: number | null;
}) {
  const mfg: StructureBonus | null = readout.mfg;
  const rxnTe = readout.rxn && readout.rxn.te > 0 ? readout.rxn.te : null;
  const tax = taxPct ?? null;
  if (mfg === null && rxnTe === null && tax === null) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2.5">
      {mfg !== null && mfg.me > 0 && (
        <Metric icon={<GemIcon state="bonus" />} title={`Structure ME −${pct(mfg.me)}`} value={pct(mfg.me)} />
      )}
      {mfg !== null && mfg.te > 0 && (
        <Metric
          icon={<HourglassIcon state="bonus" />}
          title={`Structure TE −${pct(mfg.te)}`}
          value={pct(mfg.te)}
        />
      )}
      {mfg !== null && mfg.costBonus > 0 && (
        <span
          title={`Structure job cost −${pct(mfg.costBonus)}`}
          className="font-mono text-[10px] leading-none text-isk"
        >
          cost −{pct(mfg.costBonus)}
        </span>
      )}
      {rxnTe !== null && (
        <span className="inline-flex items-center gap-1">
          {mfg !== null && (
            <span className="font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-muted">rxn</span>
          )}
          <Metric
            icon={<HourglassIcon state="bonus" />}
            title={`Reaction TE −${pct(rxnTe)}`}
            value={pct(rxnTe)}
          />
        </span>
      )}
      {tax !== null && (
        <span
          title={`Owner-set facility tax ${tax}%`}
          className="font-mono text-[10px] leading-none text-muted"
        >
          tax {tax}%
        </span>
      )}
    </span>
  );
}
