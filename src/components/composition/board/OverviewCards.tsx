'use client';

import Link from 'next/link';
import { DistributionBars } from '@/components/ui/distribution-bars';
import { StatFigure } from '@/components/ui/stat-figure';
import type { BoardCharacter, BoardHistoryDay } from '@/composition/board/api-contract';
import { formatIsk } from '@/lib/format/isk';
import { FlowLine } from './board-bits';
import {
  accountWorthSeries,
  combinedFlow,
  industryTotals,
  netWorthTotals,
  worthShares,
} from './board-view-model';
import { WorthChart, WorthHeadline } from './WorthChart';
import { SectionPanel } from './SectionBody';

/**
 * The aggregate across pilots: wealth as the main card, industry as a slim
 * card under it so the column never leaves a hole beside a short aside.
 * Per-pilot training, queue health and location live on the rail.
 */
export function OverviewCards({
  characters,
  history,
  now,
}: {
  characters: readonly BoardCharacter[];
  history: readonly BoardHistoryDay[];
  now: number;
}) {
  return (
    <div role="region" aria-label="Pilot overview" className="flex min-w-0 flex-col gap-4">
      <WealthCard characters={characters} history={history} now={now} />
      <IndustryCard characters={characters} />
    </div>
  );
}

/**
 * Estimated net worth across the pilots that have one, ISK beside it, and
 * its history as ISK and assets stacked. With no net worth yet it falls back
 * to wallet ISK alone and draws no chart; it never shows a zero net worth.
 */
function WealthCard({
  characters,
  history,
  now,
}: {
  characters: readonly BoardCharacter[];
  history: readonly BoardHistoryDay[];
  now: number;
}) {
  const { worth, liquid } = netWorthTotals(characters);
  const flow = combinedFlow(characters, now);
  const lead = worth ?? liquid;
  return (
    <SectionPanel title="Wealth">
      {lead === null ? (
        <p className="px-3.5 py-3 text-ui text-faint">No wallet has synced yet. Reconnect a pilot to add it.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1 px-3.5 pt-3 pb-2">
            <WorthHeadline
              worth={worth?.value ?? null}
              liquid={liquid?.value ?? null}
              note={lead.covered < lead.total ? `${lead.covered} of ${lead.total} pilots` : undefined}
            />
            {flow !== null && <FlowLine inflow={flow.inflow} outflow={flow.outflow} />}
          </div>
          {worth !== null && (
            <div className="px-2 pb-1">
              <WorthChart series={accountWorthSeries(history, characters, now)} ariaLabel="Estimated net worth over time" />
            </div>
          )}
          <div className="border-t border-border-soft">
            <DistributionBars rows={worthShares(characters)} formatCount={formatIsk} ariaLabel="Net worth by pilot" />
          </div>
        </>
      )}
    </SectionPanel>
  );
}

function IndustryCard({ characters }: { characters: readonly BoardCharacter[] }) {
  const totals = industryTotals(characters);
  return (
    <SectionPanel
      title="Industry"
      meta={
        <span className="flex items-center gap-3">
          {totals !== null && totals.covered !== totals.total ? (
            <span>{totals.covered} of {totals.total}</span>
          ) : null}
          <Link href="/industry/jobs" className="whitespace-nowrap text-isk no-underline transition-colors hover:text-name">
            Open jobs →
          </Link>
        </span>
      }
    >
      {totals === null ? (
        <p className="px-3.5 py-3 text-ui text-faint">No industry jobs have synced yet.</p>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 px-3.5 py-3">
          <dl className="grid grid-cols-3 gap-x-8">
            <StatFigure label="Active">{totals.active}</StatFigure>
            <StatFigure label="Ready" tone={totals.ready > 0 ? 'text-isk' : 'text-name'}>
              {totals.ready}
            </StatFigure>
            <StatFigure label="Slots">{`${totals.used}/${totals.max}`}</StatFigure>
          </dl>
          {totals.readyPilots.length > 0 ? (
            <span className="min-w-0 truncate text-ui text-isk">Ready: {totals.readyPilots.join(', ')}</span>
          ) : null}
        </div>
      )}
    </SectionPanel>
  );
}
