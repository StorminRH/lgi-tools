import type { EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import {
  deriveCronStatus,
  deriveEsiSourceStatus,
  deriveGscStatus,
  PRICES_HEALTHY_OUTCOMES,
  SDE_HEALTHY_OUTCOMES,
  SDE_NEUTRAL_OUTCOMES,
  type StatusLevel,
  type SubsystemStatus,
} from '@/data/telemetry/health-metrics';
import type {
  CronLastRun,
  CronOutcomeCount,
  FallbackRateData,
  UsageAction,
} from '@/data/telemetry/types';
import { ESI_BUDGET_FLOOR } from '@/platform/esi';
import type { EsiBudgetSnapshot } from '@/platform/esi/scoreboard';
import { LIVE_ESI_REFRESH_JOB_STATUSES } from '@/data/esi-refresh-jobs/constants';

export interface CronSignals {
  lastRuns: CronLastRun[];
  priceOutcomes: CronOutcomeCount[];
  sdeOutcomes: CronOutcomeCount[];
  gscOutcomes: CronOutcomeCount[];
  gscConfigured: boolean;
  gscLastSyncedAt: Date | null;
}

export interface SliSignals {
  readSuccess: number | null;
  mutationSuccess: number | null;
  latencyP95: number | null;
  esiSuccess: number | null;
}

export interface AdminSignals {
  now: Date;
  crons: CronSignals;
  budget: EsiBudgetSnapshot | null;
  fallback: FallbackRateData;
  budgetExhaustions: number;
  sli: SliSignals;
  queue: EsiRefreshQueueStat[];
  statics: { feedVersion: string; totalDifferences: number } | null;
  releases: { date: string; label: string }[];
}

export interface CronStatuses {
  price: SubsystemStatus;
  sde: SubsystemStatus;
  gsc: SubsystemStatus;
}

export function deriveCronStatuses(crons: CronSignals, now: Date): CronStatuses {
  const lastFor = (action: UsageAction) =>
    crons.lastRuns.find((run) => run.action === action) ?? null;
  return {
    price: deriveCronStatus({
      lastRun: lastFor('cron_prices'),
      outcomes: crons.priceOutcomes,
      healthy: PRICES_HEALTHY_OUTCOMES,
      expectedEveryHours: 24,
      now,
    }),
    sde: deriveCronStatus({
      lastRun: lastFor('cron_sde'),
      outcomes: crons.sdeOutcomes,
      healthy: SDE_HEALTHY_OUTCOMES,
      neutral: SDE_NEUTRAL_OUTCOMES,
      expectedEveryHours: 24,
      now,
    }),
    gsc: deriveGscStatus({
      configured: crons.gscConfigured,
      lastRun: lastFor('cron_gsc'),
      outcomes: crons.gscOutcomes,
      lastSyncedAt: crons.gscLastSyncedAt,
      now,
    }),
  };
}

// Targets are the operator's alert lines, not published SLOs. A breach of
// `warn` turns the row amber and a breach of `fail` turns it red.
const SLI_TARGETS = {
  readSuccess: { warn: 0.99, fail: 0.95, direction: 'min' },
  mutationSuccess: { warn: 0.99, fail: 0.95, direction: 'min' },
  esiSuccess: { warn: 0.95, fail: 0.8, direction: 'min' },
  latencyP95: { warn: 1500, fail: 3000, direction: 'max' },
} as const satisfies Record<
  keyof SliSignals,
  { warn: number; fail: number; direction: 'min' | 'max' }
>;

export function sliLevel(key: keyof SliSignals, value: number | null): StatusLevel {
  if (value === null || Number.isNaN(value)) return 'neutral';
  const target = SLI_TARGETS[key];
  const breaches = (limit: number) =>
    target.direction === 'min' ? value < limit : value > limit;
  if (breaches(target.fail)) return 'red';
  if (breaches(target.warn)) return 'amber';
  return 'green';
}

export function formatSliValue(key: keyof SliSignals, value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'no data';
  if (key === 'latencyP95') return `${Math.round(value).toLocaleString()} ms`;
  return `${(value * 100).toFixed(1)}%`;
}

export function sliTargetLabel(key: keyof SliSignals): string {
  const target = SLI_TARGETS[key];
  if (target.direction === 'max') return `≤ ${target.warn.toLocaleString()} ms`;
  return `≥ ${Math.round(target.warn * 100)}%`;
}

export interface StatusLine {
  id: string;
  label: string;
  value: string;
  note: string;
  level: StatusLevel;
  // Stays off the attention list: amber that informs rather than asks for
  // action, or a line whose attention item is built elsewhere.
  quiet?: boolean;
}

export interface StatusGroup {
  id: 'app' | 'esi' | 'jobs';
  title: string;
  href: string;
  linkLabel: string;
  lines: StatusLine[];
}

// deriveCronStatus headlines read "<state> · <detail>"; the overview shows
// the state as the value and the detail beneath it.
export function splitHeadline(status: SubsystemStatus): { value: string; note: string } {
  const [value = '', ...rest] = status.headline.split(' · ');
  return { value, note: rest.join(' · ') };
}

function sliLine(id: keyof SliSignals, label: string, sli: SliSignals): StatusLine {
  return {
    id,
    label,
    value: formatSliValue(id, sli[id]),
    note: `target ${sliTargetLabel(id)}`,
    level: sliLevel(id, sli[id]),
  };
}

export interface BudgetStatus {
  level: StatusLevel;
  value: string;
  note: string;
}

export function deriveBudgetStatus(budget: EsiBudgetSnapshot | null): BudgetStatus {
  if (budget === null) {
    return { level: 'red', value: 'unavailable', note: 'scoreboard down · dispatch failing closed' };
  }
  const below = budget.effectiveRemaining < ESI_BUDGET_FLOOR;
  return {
    level: below ? 'red' : 'green',
    value: `${budget.effectiveRemaining.toLocaleString()} left`,
    note: below
      ? `below the ${ESI_BUDGET_FLOOR}-request floor · calls are held`
      : `floor ${ESI_BUDGET_FLOOR} · live`,
  };
}

function elapsedHours(from: Date, now: Date): number {
  return Math.max(0, (now.getTime() - from.getTime()) / 3_600_000);
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.floor(hours * 60)}m`;
  if (hours < 48) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

// A live job older than this means owner data is going stale.
const QUEUE_STALE_HOURS = 6;

export interface QueueSummary {
  due: number;
  deadLettered: number;
  oldestDueHours: number | null;
}

export function summarizeQueue(stats: EsiRefreshQueueStat[], now: Date): QueueSummary {
  const live = new Set<string>(LIVE_ESI_REFRESH_JOB_STATUSES);
  let due = 0;
  let deadLettered = 0;
  let oldest: Date | null = null;
  for (const stat of stats) {
    if (stat.status === 'dead_lettered') deadLettered += stat.count;
    if (!live.has(stat.status)) continue;
    due += stat.count;
    if (oldest === null || stat.oldestCreatedAt < oldest) oldest = stat.oldestCreatedAt;
  }
  return { due, deadLettered, oldestDueHours: oldest === null ? null : elapsedHours(oldest, now) };
}

export function queueLevel(queue: QueueSummary): StatusLevel {
  if (queue.deadLettered > 0) return 'red';
  if (queue.oldestDueHours !== null && queue.oldestDueHours > QUEUE_STALE_HOURS) return 'amber';
  return 'green';
}

function queueLine(queue: QueueSummary): StatusLine {
  return {
    id: 'queue',
    label: 'Refresh queue',
    value: `${queue.due.toLocaleString()} due · ${queue.deadLettered.toLocaleString()} dead`,
    note:
      queue.oldestDueHours === null
        ? 'nothing waiting'
        : `oldest due ${formatHours(queue.oldestDueHours)}`,
    level: queueLevel(queue),
    quiet: true,
  };
}

function cronLine(id: string, label: string, status: SubsystemStatus): StatusLine {
  const headline = splitHeadline(status);
  return { id, label, ...headline, level: status.level, quiet: headline.value === 'recovered' };
}

function releaseLine(releases: AdminSignals['releases'], now: Date): StatusLine {
  const latest = releases.reduce<AdminSignals['releases'][number] | null>(
    (best, release) => (best === null || release.date > best.date ? release : best),
    null,
  );
  if (latest === null) {
    return { id: 'release', label: 'Latest release', value: 'none', note: 'no changelog entries', level: 'neutral' };
  }
  const days = Math.max(0, Math.floor((now.getTime() - Date.parse(latest.date)) / 86_400_000));
  return {
    id: 'release',
    label: 'Latest release',
    value: latest.label,
    note: `${latest.date} · ${days === 0 ? 'today' : `${days}d ago`}`,
    level: 'neutral',
  };
}

function heldForBudgetLine(stats: EsiRefreshQueueStat[]): StatusLine {
  const held = stats
    .filter((stat) => stat.status === 'deferred_for_budget')
    .reduce((total, stat) => total + stat.count, 0);
  return {
    id: 'held-for-budget',
    label: 'Held for budget',
    value: `${held.toLocaleString()} job${held === 1 ? '' : 's'}`,
    note: 'refreshes waiting for the budget to recover',
    level: held > 0 ? 'amber' : 'green',
    quiet: true,
  };
}

function priceSourceLine(signals: AdminSignals): StatusLine {
  const status = deriveEsiSourceStatus({
    fallback: signals.fallback,
    budgetExhaustions: signals.budgetExhaustions,
  });
  const { value, note } = splitHeadline(status);
  // Some Fuzzwork fallback is the design working; only a majority fallback needs you.
  return { id: 'price-source', label: 'Price source', value, note, level: status.level, quiet: status.level !== 'red' };
}

export function deriveStatusGroups(signals: AdminSignals): StatusGroup[] {
  const crons = deriveCronStatuses(signals.crons, signals.now);
  const budget = deriveBudgetStatus(signals.budget);
  return [
    {
      id: 'app',
      title: 'App',
      href: '/admin/health',
      linkLabel: 'Health',
      lines: [
        sliLine('readSuccess', 'Page & tool reads', signals.sli),
        sliLine('mutationSuccess', 'Mutations', signals.sli),
        sliLine('latencyP95', 'p95 latency', signals.sli),
        releaseLine(signals.releases, signals.now),
      ],
    },
    {
      id: 'esi',
      title: 'ESI',
      href: '/admin/esi',
      linkLabel: 'ESI',
      lines: [
        { id: 'budget', label: 'Error budget', ...budget },
        sliLine('esiSuccess', 'ESI success', signals.sli),
        priceSourceLine(signals),
        heldForBudgetLine(signals.queue),
      ],
    },
    {
      id: 'jobs',
      title: 'Jobs',
      href: '/admin/health#scheduled',
      linkLabel: 'Jobs',
      lines: [
        cronLine('cron-prices', 'Price cron', crons.price),
        cronLine('cron-sde', 'SDE cron', crons.sde),
        cronLine('cron-gsc', 'GSC sync', crons.gsc),
        queueLine(summarizeQueue(signals.queue, signals.now)),
      ],
    },
  ];
}

export interface AttentionItem {
  id: string;
  level: 'red' | 'amber';
  title: string;
  detail: string;
  action: { label: string; href: string };
}

function isAlert(level: StatusLevel): level is 'red' | 'amber' {
  return level === 'red' || level === 'amber';
}

function staticsAttention(statics: AdminSignals['statics']): AttentionItem[] {
  if (statics === null) return [];
  return [
    {
      id: 'statics',
      level: 'amber',
      title: `Wormhole statics feed v${statics.feedVersion} is waiting for review`,
      detail: `${statics.totalDifferences.toLocaleString()} assignment differences. Serving data only changes when you promote it.`,
      action: { label: 'Review snapshot', href: '/admin/statics' },
    },
  ];
}

function queueAttention(queue: QueueSummary): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (queue.deadLettered > 0) {
    items.push({
      id: 'dead-letters',
      level: 'red',
      title: `${queue.deadLettered.toLocaleString()} refresh job${queue.deadLettered === 1 ? '' : 's'} dead-lettered`,
      detail: 'Owner data for these pilots and corporations stops refreshing until you retry.',
      action: { label: 'Open queue', href: '/admin/queue' },
    });
  }
  if (queue.oldestDueHours !== null && queue.oldestDueHours > QUEUE_STALE_HOURS) {
    items.push({
      id: 'queue-backlog',
      level: 'amber',
      title: `Refresh backlog of ${queue.due.toLocaleString()} jobs, oldest ${formatHours(queue.oldestDueHours)}`,
      detail: 'Jobs are waiting longer than usual; check whether the ESI budget is holding them.',
      action: { label: 'Open queue', href: '/admin/queue' },
    });
  }
  return items;
}

function lineAttention(line: StatusLine, action: AttentionItem['action']): AttentionItem[] {
  if (!isAlert(line.level) || line.quiet) return [];
  return [
    {
      id: line.id,
      level: line.level,
      title: `${line.label}: ${line.value}`,
      detail: line.note,
      action,
    },
  ];
}

export function deriveAttention(signals: AdminSignals, groups: StatusGroup[]): AttentionItem[] {
  const actionFor: Record<StatusGroup['id'], AttentionItem['action']> = {
    app: { label: 'Open health', href: '/admin/health' },
    esi: { label: 'Open ESI', href: '/admin/esi' },
    jobs: { label: 'View jobs', href: '/admin/health#scheduled' },
  };
  const statusItems = groups.flatMap((group) =>
    group.lines.flatMap((line) => lineAttention(line, actionFor[group.id])),
  );
  const items = [
    ...statusItems,
    ...queueAttention(summarizeQueue(signals.queue, signals.now)),
    ...staticsAttention(signals.statics),
  ];
  return [...items.filter((i) => i.level === 'red'), ...items.filter((i) => i.level === 'amber')];
}
