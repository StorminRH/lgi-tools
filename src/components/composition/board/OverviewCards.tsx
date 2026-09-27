'use client';

import Link from 'next/link';
import { ViewTransition } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { TypeIcon } from '@/components/type-icon';
import { cn } from '@/components/ui/cn';
import { DistributionBars } from '@/components/ui/distribution-bars';
import { eyebrow } from '@/components/ui/type-roles';
import type { BoardCharacter } from '@/composition/board/api-contract';
import { TrainingLine } from '@/features/skill-queue/components/TrainingLine';
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity } from '@/lib/format/number';
import { formatUtcDate } from '@/lib/format/time';
import { BalanceTrend } from './BalanceTrend';
import { HealthLine, KpiTile, StatFigure, SystemName } from './board-bits';
import { CARDS_MOTION, LATE_CARDS_MOTION } from './board-motion';
import {
  combinedFlow,
  coverageNote,
  industryTotals,
  netWorthSeries,
  rosterTotals,
  trainingRows,
  walletShares,
  whereaboutsRows,
} from './board-view-model';
import { SectionPanel } from './SectionBody';

// Parts sit directly under the caller's persistent card area so each one
// runs its own enter and exit (see CharacterDetail).
export function OverviewCards({
  characters,
  names,
  now,
}: {
  characters: readonly BoardCharacter[];
  names: Readonly<Record<string, string>>;
  now: number;
}) {
  return (
    <>
      <ViewTransition {...CARDS_MOTION} default="none">
        <OverviewKpis characters={characters} now={now} />
      </ViewTransition>
      <ViewTransition {...LATE_CARDS_MOTION} default="none">
        {/* DOM order is the phone order: wealth, training, whereabouts, industry. */}
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <WealthCard characters={characters} now={now} className="lg:col-start-1 lg:row-span-2 lg:row-start-1" />
          <TrainingCard characters={characters} names={names} now={now} className="lg:col-start-2 lg:row-start-1" />
          <WhereaboutsCard characters={characters} className="lg:col-span-2 lg:row-start-3" />
          <IndustryCard characters={characters} className="lg:col-start-2 lg:row-start-2" />
        </div>
      </ViewTransition>
    </>
  );
}

function OverviewKpis({ characters, now }: { characters: readonly BoardCharacter[]; now: number }) {
  const totals = rosterTotals(characters, now);
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <KpiTile label="Pilots">{totals.pilots}</KpiTile>
      <KpiTile label="Wallets" tone="text-isk" note={totals.isk === null ? undefined : coverageNote(totals.isk).trim() || undefined} noteTone="text-muted">
        {totals.isk === null ? '—' : formatIsk(totals.isk.value)}
      </KpiTile>
      <KpiTile label="Skill points" note={totals.sp === null ? undefined : coverageNote(totals.sp).trim() || undefined} noteTone="text-muted">
        {totals.sp === null ? '—' : formatCompactQuantity(totals.sp.value)}
      </KpiTile>
      <KpiTile label="Training" tone="text-evb-bright">
        {totals.training}
      </KpiTile>
    </dl>
  );
}

function TrainingCard({
  characters,
  names,
  now,
  className,
}: {
  characters: readonly BoardCharacter[];
  names: Readonly<Record<string, string>>;
  now: number;
  className: string;
}) {
  return (
    <SectionPanel title="Training" className={className}>
      <ul>
        {trainingRows(characters, names, now).map((row) => (
          <li key={row.characterId} className="flex items-start gap-3 border-t border-border-soft px-3.5 py-2.5 first:border-t-0">
            <CharacterPortrait characterId={row.characterId} name={row.name} size={32} src={row.portraitUrl} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-micro">
                <span className="truncate text-ui text-name">{row.name}</span>
                <HealthLine health={row.health} className="shrink-0" />
              </div>
              {row.training !== null && (
                <TrainingLine training={row.training} skillName={row.skillName} remainingLabel={row.remainingLabel} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

function WealthCard({
  characters,
  now,
  className,
}: {
  characters: readonly BoardCharacter[];
  now: number;
  className: string;
}) {
  const totals = rosterTotals(characters, now);
  const flow = combinedFlow(characters, now);
  const shares = walletShares(characters);
  const worth = netWorthSeries(characters, now);
  return (
    <SectionPanel title="Wealth" meta={totals.isk === null ? undefined : `wallets${coverageNote(totals.isk)}`} className={className}>
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

function IndustryCard({ characters, className }: { characters: readonly BoardCharacter[]; className: string }) {
  const totals = industryTotals(characters);
  return (
    <SectionPanel
      title="Industry"
      meta={totals === null || totals.covered === totals.total ? undefined : `${totals.covered} of ${totals.total}`}
      className={className}
    >
      {totals === null ? (
        <p className="px-3.5 py-3 text-ui text-faint">No industry jobs have synced yet.</p>
      ) : (
        <div className="flex flex-col gap-3 px-3.5 py-3">
          <dl className="grid grid-cols-3 gap-3">
            <StatFigure label="Active" value={totals.active} />
            <StatFigure label="Ready" value={totals.ready} tone={totals.ready > 0 ? 'text-isk' : 'text-name'} />
            <StatFigure label="Slots" value={`${totals.used}/${totals.max}`} />
          </dl>
          <div className="flex items-center justify-between gap-2 text-ui">
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


function WhereaboutsCard({ characters, className }: { characters: readonly BoardCharacter[]; className: string }) {
  return (
    <SectionPanel title="Whereabouts" className={className}>
      <ul>
        {whereaboutsRows(characters).map((row) => (
          <li
            key={row.characterId}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-t border-border-soft px-3.5 py-2 text-ui first:border-t-0 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto]"
          >
            <span className="truncate text-name">{row.name}</span>
            {row.status === null ? (
              <span className="text-micro text-faint sm:col-span-2">Location not synced</span>
            ) : (
              <>
                <span className="col-span-2 row-start-2 flex min-w-0 items-baseline gap-2 text-micro sm:col-span-1 sm:row-start-1 sm:col-start-2">
                  <SystemName system={row.status.system} />
                  <span className="truncate text-muted">{row.status.docked ?? 'In space'}</span>
                </span>
                <span className="flex items-center gap-2 justify-self-end text-micro text-muted sm:row-start-1 sm:col-start-3">
                  <TypeIcon typeId={row.status.ship.typeId} size={22} alt="" />
                  {row.status.ship.typeName}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}
