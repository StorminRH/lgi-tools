'use client';

import type { ReactNode } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { GemIcon, HourglassIcon } from './MeAdjuster';
import { structureBonusRows, type StructureBonusRow } from '../structure-bonus-view';
import type { StructureReadout } from '../structure-factors';

// One glyph + percent pair — the gem/hourglass stand in for the old "Mfg ME/TE"
// words, in their ISK-green bonus tone.
function Metric({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return (
    <Tooltip content={title}>
      <span
        tabIndex={0}
        className="inline-flex items-center gap-1 font-data text-micro leading-none text-isk"
      >
        <span aria-hidden className="inline-flex h-3 w-3 shrink-0">
          {icon}
        </span>
        −{value}
      </span>
    </Tooltip>
  );
}

// Config-map dispatch (keyed by row kind) so the readout maps over the decided
// rows instead of a branch ladder — each renderer stays a trivial leaf.
const BONUS_ROW: {
  [K in StructureBonusRow['kind']]: (row: Extract<StructureBonusRow, { kind: K }>) => ReactNode;
} = {
  me: (row) => <Metric icon={<GemIcon state="bonus" />} title={`Structure ME −${row.pct}`} value={row.pct} />,
  te: (row) => (
    <Metric icon={<HourglassIcon state="bonus" />} title={`Structure TE −${row.pct}`} value={row.pct} />
  ),
  cost: (row) => (
    <Tooltip content={`Structure job cost −${row.pct}`}>
      <span tabIndex={0} className="font-data text-micro leading-none text-isk">
        cost −{row.pct}
      </span>
    </Tooltip>
  ),
  'rxn-te': (row) => (
    <span className="inline-flex items-center gap-1">
      {row.withMarker && (
        <span className="font-data text-label uppercase leading-none tracking-label text-muted">rxn</span>
      )}
      <Metric icon={<HourglassIcon state="bonus" />} title={`Reaction TE −${row.pct}`} value={row.pct} />
    </span>
  ),
  tax: (row) => (
    <Tooltip content={`Owner-set facility tax ${row.taxPct}%`}>
      <span tabIndex={0} className="font-data text-micro leading-none text-muted">
        tax {row.taxPct}%
      </span>
    </Tooltip>
  ),
};

function BonusRowView({ row }: { row: StructureBonusRow }) {
  const render = BONUS_ROW[row.kind] as (r: StructureBonusRow) => ReactNode;
  return <>{render(row)}</>;
}

/**
 * A structure slot's compact bonus readout (3.7.13.2 hero rework): the ME gem and
 * TE hourglass with bare percents, replacing the wordy green pills that pushed the
 * hero's controls around. Renders inside a fixed-height slot the selectors reserve,
 * so a bonus appearing or vanishing never reflows the card. The slot passes only
 * the bonuses it actually hosts, so readouts never double up across the two slots;
 * the reaction contribution gets a tiny "rxn" marker only when it shares the line
 * with manufacturing parts (a lone-refinery build slot hosts both).
 *
 * `taxPct` is the slot structure's owner-ENTERED facility tax (3.7.13.3), shown
 * muted — a tax is a cost, not a bonus. Rendered only when entered (including a
 * real 0%); the unset 0.25%-assumed baseline stays out of the hero and lives in
 * the fee-breakdown hover instead.
 */
export function StructureBonusReadout({
  readout,
  taxPct,
}: {
  readout: StructureReadout;
  taxPct?: number | null;
}) {
  const rows = structureBonusRows(readout, taxPct);
  if (rows.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2.5">
      {rows.map((row, i) => (
        <BonusRowView key={i} row={row} />
      ))}
    </span>
  );
}
