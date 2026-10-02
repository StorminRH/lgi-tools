'use client';

import type { ReactNode } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { GemIcon, HourglassIcon } from './MeAdjuster';
import { structureBonusRows, type StructureBonusRow } from '../structure-bonus-view';
import type { StructureReadout } from '../structure-factors';

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

function ReactionMetric({ withMarker, children }: { withMarker: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {withMarker && (
        <span className="font-data text-label uppercase leading-none tracking-label text-muted">rxn</span>
      )}
      {children}
    </span>
  );
}

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
  'rxn-me': (row) => (
    <ReactionMetric withMarker={row.withMarker}>
      <Metric icon={<GemIcon state="bonus" />} title={`Reaction ME −${row.pct}`} value={row.pct} />
    </ReactionMetric>
  ),
  'rxn-te': (row) => (
    <ReactionMetric withMarker={row.withMarker}>
      <Metric icon={<HourglassIcon state="bonus" />} title={`Reaction TE −${row.pct}`} value={row.pct} />
    </ReactionMetric>
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
