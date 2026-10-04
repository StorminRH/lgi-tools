'use client';

import { Fragment, type ReactNode } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { GemIcon, HourglassIcon } from './MeAdjuster';
import { structureBonusColumns, type StructureBonusRow } from '../structure-bonus-view';
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

function RxnMarker() {
  return <span className="font-data text-label uppercase leading-none tracking-label text-muted">rxn</span>;
}

function ReactionMetric({ withMarker, children }: { withMarker: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {withMarker && <RxnMarker />}
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

const unmarked = (row: StructureBonusRow): StructureBonusRow =>
  row.kind === 'rxn-me' || row.kind === 'rxn-te' ? { ...row, withMarker: false } : row;

/**
 * The same readout in fixed columns, so a list of structures lines up. The
 * leading column holds the reaction marker; a caller can size it through
 * `--bonus-label-col` (auto by default).
 */
export function StructureBonusColumns({
  readout,
  taxPct,
}: {
  readout: StructureReadout;
  taxPct?: number | null;
}) {
  const lines = structureBonusColumns(readout, taxPct);
  if (lines.length === 0) return null;
  return (
    <span className="grid grid-cols-[var(--bonus-label-col,auto)_repeat(2,calc(1rem+6ch))_repeat(2,10ch)] items-center gap-x-3 gap-y-1.5 font-data text-micro">
      {lines.map((line) => (
        <Fragment key={line.reactions ? 'rxn' : 'mfg'}>
          <span className="justify-self-end">{line.reactions ? <RxnMarker /> : null}</span>
          {line.cells.map((row, i) => (
            <span key={i} className="flex">
              {row ? <BonusRowView row={unmarked(row)} /> : null}
            </span>
          ))}
        </Fragment>
      ))}
    </span>
  );
}
