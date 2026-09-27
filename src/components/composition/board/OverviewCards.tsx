'use client';

import Link from 'next/link';
import { cn } from '@/components/ui/cn';
import { DistributionBars } from '@/components/ui/distribution-bars';
import { eyebrow } from '@/components/ui/type-roles';
import type { BoardCharacter } from '@/composition/board/api-contract';
import { formatIsk } from '@/lib/format/isk';
import { formatUtcDate } from '@/lib/format/time';
import { BalanceTrend } from './BalanceTrend';
import { StatFigure } from './board-bits';
import {
  combinedFlow,
  coverageNote,
  industryTotals,
  netWorthSeries,
  rosterTotals,
  walletShares,
} from './board-view-model';
import { SectionPanel } from './SectionBody';

/**
 * The aggregate across pilots: wealth as the main card, industry as a slim
 * card under it so the column never leaves a hole beside a short aside.
 * Per-pilot training, queue health and location live on the rail.
 */
export function OverviewCards({ characters, now }: { characters: readonly BoardCharacter[]; now: number }) {
  return (
    <div
      role="region"
      aria-label="Pilot overview"
      className="flex min-w-0 flex-col gap-4"
    >
      <WealthCard characters={characters} now={now} />
      <IndustryCard characters={characters} />
    </div>
  );
}

function WealthCard({
  characters,
  now,
}: {
  characters: readonly BoardCharacter[];
  now: number;
}) {
  const totals = rosterTotals(characters, now);
  const flow = combinedFlow(characters, now);
  const shares = walletShares(characters);
  const worth = netWorthSeries(characters, now);
  return (
    <SectionPanel title="Wealth" meta={totals.isk === null ? undefined : `wallets${coverageNote(totals.isk)}`}>
      {totals.isk === null ? (
        <p className="px-3.5 py-3 text-ui text-faint">No wallet has synced yet. Reconnect a pilot to add it.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2 px-3.5 pt-3 pb-2">
            <div className="flex flex-col gap-0.5">
              <span className={eyebrow({ size: 'micro' })}>Combined</span>
              <span className="font-data text-stat tabular-nums text-isk">
                {formatIsk(totals.isk.value)} <span className="text-ui text-muted">ISK</span>
              </span>
            </div>
            {flow !== null && (
              <div className="flex flex-col gap-0.5 font-data text-ui tabular-nums">
                <span className={eyebrow({ size: 'micro' })}>
                  {flow.label}
                  {flow.covered < flow.total && ` · ${flow.covered} of ${flow.total}`}
                </span>
                <span>
                  <span className="text-isk">+{formatIsk(flow.inflow)}</span>
                  <span className="text-faint"> in · </span>
                  <span className="text-dps-high">−{formatIsk(flow.outflow)}</span>
                  <span className="text-faint"> out</span>
                </span>
              </div>
            )}
          </div>
          {worth.points.length > 1 && worth.from !== null && (
            <figure className="border-t border-border-soft px-2 pt-2.5 pb-1">
              <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 px-1.5 pb-1">
                <span className={eyebrow({ size: 'micro', weight: 'semibold', emphasis: 'strong' })}>Net worth</span>
                <span className="font-data text-micro text-muted">{netWorthCaption(worth)}</span>
              </figcaption>
              <BalanceTrend series={worth.points} ariaLabel="Combined wallet ISK over time" height={196} />
            </figure>
          )}
          <div className="border-t border-border-soft">
            <DistributionBars rows={shares} formatCount={formatIsk} ariaLabel="ISK by pilot" />
          </div>
        </>
      )}
    </SectionPanel>
  );
}

function netWorthCaption({ from, included, of }: { from: number | null; included: number; of: number }): string {
  const pilots = included < of ? ` · ${included} of ${of} pilots` : '';
  const since = from === null ? '' : ` · since ${formatUtcDate(new Date(from)).replace(/ \d{4}$/, '')}`;
  return `Wallet ISK${pilots}${since}`;
}

function IndustryCard({ characters }: { characters: readonly BoardCharacter[] }) {
  const totals = industryTotals(characters);
  return (
    <SectionPanel
      title="Industry"
      meta={totals === null || totals.covered === totals.total ? undefined : `${totals.covered} of ${totals.total}`}
    >
      {totals === null ? (
        <p className="px-3.5 py-3 text-ui text-faint">No industry jobs have synced yet.</p>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 px-3.5 py-3">
          <dl className="grid grid-cols-3 gap-x-8">
            <StatFigure label="Active" value={totals.active} />
            <StatFigure label="Ready" value={totals.ready} tone={totals.ready > 0 ? 'text-isk' : 'text-name'} />
            <StatFigure label="Slots" value={`${totals.used}/${totals.max}`} />
          </dl>
          <div className="flex min-w-0 flex-1 basis-full items-center justify-between gap-4 text-ui sm:basis-auto sm:justify-end">
            <span className={cn('min-w-0 truncate', totals.readyPilots.length > 0 ? 'text-isk' : 'text-faint')}>
              {totals.readyPilots.length > 0 ? `Ready: ${totals.readyPilots.join(', ')}` : 'Nothing to deliver'}
            </span>
            <Link href="/jobs" className="shrink-0 whitespace-nowrap text-muted underline-offset-2 hover:text-isk hover:underline">
              Open jobs →
            </Link>
          </div>
        </div>
      )}
    </SectionPanel>
  );
}
