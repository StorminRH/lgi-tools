'use client';

import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import type { BoardCharacter, BoardHistoryDay } from '@/composition/board/api-contract';
import { formatIsk } from '@/lib/format/isk';
import { formatUtcDate } from '@/lib/format/time';
import { BalanceTrend } from '../BalanceTrend';
import { FlowLine } from '../board-bits';
import { pilotWorthSeries, recentJournal } from '../board-view-model';
import { SectionBody, SectionPanel, updatedLabel } from '../SectionBody';
import { WorthChart, WorthHeadline } from '../WorthChart';

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

/**
 * The pilot's estimated net worth with ISK beside it and its history as
 * stacked ISK and assets, then the recent journal. Until net worth is known
 * it leads with the wallet balance and charts the journal's balance instead.
 */
export function WalletSection({
  character,
  history,
  now,
  className,
}: {
  character: BoardCharacter;
  history: readonly BoardHistoryDay[];
  now: number;
  className?: string;
}) {
  const { wallet, journal } = character;
  const worth = character.netWorth.state === 'ready' ? character.netWorth.data.total : null;
  return (
    <SectionPanel title="Wallet" meta={updatedLabel(wallet, now)} className={className}>
      <SectionBody section={wallet}>
        {({ balance }) => (
          <>
            <div className="flex flex-col gap-1 px-3.5 pt-3 pb-2">
              <WorthHeadline worth={worth} liquid={balance} />
              {journal.state === 'ready' && <FlowLine inflow={journal.data.inflow} outflow={journal.data.outflow} />}
            </div>
            {worth !== null && (
              <div className="px-2 pb-2">
                <WorthChart series={pilotWorthSeries(history, character, now)} ariaLabel="Estimated net worth over time" height={170} />
              </div>
            )}
            <SectionBody section={journal}>{(data) => <JournalBody journal={data} chart={worth === null} />}</SectionBody>
          </>
        )}
      </SectionBody>
    </SectionPanel>
  );
}

function JournalBody({ journal, chart }: { journal: Journal; chart: boolean }) {
  const rows = recentJournal(journal.recent);
  return (
    <>
      {chart && journal.series.length > 1 && (
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
