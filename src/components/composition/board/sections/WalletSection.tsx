'use client';

import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import type { BoardCharacter } from '@/composition/board/api-contract';
import { formatIsk } from '@/lib/format/isk';
import { formatUtcDate } from '@/lib/format/time';
import { BalanceTrend } from '../BalanceTrend';
import { FlowLine } from '../board-bits';
import { recentJournal } from '../board-view-model';
import { SectionBody, SectionPanel, updatedLabel } from '../SectionBody';

type Journal = Extract<BoardCharacter['journal'], { state: 'ready' }>['data'];
type JournalRow = Journal['recent'][number];

const signedIsk = (amount: number): string => `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${formatIsk(Math.abs(amount))}`;

const COLUMNS: readonly StaticTableColumn<JournalRow>[] = [
  {
    key: 'date',
    label: 'Date',
    className: 'whitespace-nowrap text-muted',
    render: (row) => formatUtcDate(row.date).replace(/ \d{4}$/, ''),
  },
  { key: 'type', label: 'Type', className: 'max-w-[160px] truncate text-name', render: (row) => row.refLabel },
  {
    key: 'amount',
    label: 'Amount',
    align: 'right',
    className: 'whitespace-nowrap tabular-nums',
    render: (row) => (
      <span className={row.amount >= 0 ? 'text-isk' : 'text-dps-high'}>{signedIsk(row.amount)}</span>
    ),
  },
  {
    key: 'description',
    label: 'Description',
    headerClassName: 'hidden sm:table-cell',
    className: 'hidden max-w-[220px] truncate text-muted sm:table-cell',
    render: (row) => row.description,
  },
];

export function WalletSection({
  wallet,
  journal,
  now,
  className,
}: {
  wallet: BoardCharacter['wallet'];
  journal: BoardCharacter['journal'];
  now: number;
  className?: string;
}) {
  return (
    <SectionPanel title="Wallet" meta={updatedLabel(wallet, now)} className={className}>
      <SectionBody section={wallet}>
        {({ balance }) => (
          <>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-3.5 pt-3 pb-2">
              <span className="font-data text-stat tabular-nums text-isk">
                {formatIsk(balance)} <span className="text-ui text-muted">ISK</span>
              </span>
              {journal.state === 'ready' && <FlowLine inflow={journal.data.inflow} outflow={journal.data.outflow} />}
            </div>
            <SectionBody section={journal}>{(data) => <JournalBody journal={data} />}</SectionBody>
          </>
        )}
      </SectionBody>
    </SectionPanel>
  );
}

function JournalBody({ journal }: { journal: Journal }) {
  const rows = recentJournal(journal.recent);
  return (
    <>
      {journal.series.length > 1 && (
        <div className="px-2 pb-2">
          <BalanceTrend series={journal.series} ariaLabel="Wallet balance over time" />
        </div>
      )}
      {rows.length === 0 ? (
        <p className="border-t border-border-soft px-3.5 py-3 text-ui text-faint">No journal entries yet.</p>
      ) : (
        <div className="border-t border-border-soft">
          <StaticTable
            columns={COLUMNS}
            rows={rows}
            getRowKey={(row) => row.id}
            ariaLabel="Recent wallet journal"
            className="table-fixed sm:table-auto"
          />
        </div>
      )}
    </>
  );
}
