import type { EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import {
  deriveCronStatus,
  deriveEsiSourceStatus,
  deriveGscStatus,
  GSC_OUTCOME_RULES,
  HOUSEKEEPING_HEALTHY_OUTCOMES,
  type OutcomeRules,
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
import { SECTION_LOAD_FAILED } from './load-section';

export interface CronSignals {
  lastRuns: CronLastRun[];
  priceOutcomes: CronOutcomeCount[];
  sdeOutcomes: CronOutcomeCount[];
  gscOutcomes: CronOutcomeCount[];
  housekeepingOutcomes: CronOutcomeCount[];
  gscConfigured: boolean;
  gscLastSyncedAt: Date | null;
}

export interface SliSignals {
  readSuccess: Loaded<number | null>;
  mutationSuccess: Loaded<number | null>;
  latencyP95: Loaded<number | null>;
  esiSuccess: Loaded<number | null>;
}

// Each source loads on its own, so one failed read marks only its own lines.
export type Loaded<T> = T | typeof SECTION_LOAD_FAILED;

export interface AdminSignals {
  now: Date;
  crons: Loaded<CronSignals>;
  budget: Loaded<EsiBudgetSnapshot | null>;
  fallback: Loaded<FallbackRateData>;
  budgetExhaustions: Loaded<number>;
  sli: Loaded<SliSignals>;
  queue: Loaded<EsiRefreshQueueStat[]>;
  statics: Loaded<{ feedVersion: string; totalDifferences: number } | null>;
  releases: Loaded<{ date: string; label: string }[]>;
}

const HEALTH_PAGE = { label: 'Open health', href: '/admin/health' };
const ESI_PAGE = { label: 'Open ESI', href: '/admin/esi' };

// Where an operator goes to see a source directly when the overview could not read it.
const SOURCES: Record<Exclude<keyof AdminSignals, 'now'>, { label: string; page: { label: string; href: string } }> = {
  crons: { label: 'scheduled jobs', page: { label: 'View jobs', href: '/admin/health#scheduled' } },
  budget: { label: 'ESI error budget', page: ESI_PAGE },
  fallback: { label: 'price source', page: ESI_PAGE },
  budgetExhaustions: { label: 'price source', page: ESI_PAGE },
  sli: { label: 'service levels', page: HEALTH_PAGE },
  queue: { label: 'refresh queue', page: { label: 'Open queue', href: '/admin/queue' } },
  statics: { label: 'statics review', page: { label: 'Open statics', href: '/admin/statics' } },
  releases: { label: 'releases', page: HEALTH_PAGE },
};

function unavailableLine(id: string, label: string): StatusLine {
  return { id, label, value: 'unavailable', note: '', level: 'neutral' };
}

export interface CronStatuses {
  price: SubsystemStatus;
  sde: SubsystemStatus;
  gsc: SubsystemStatus;
  housekeeping: SubsystemStatus;
}

export const CRON_OUTCOME_RULES = {
  price: { healthy: PRICES_HEALTHY_OUTCOMES },
  sde: { healthy: SDE_HEALTHY_OUTCOMES, neutral: SDE_NEUTRAL_OUTCOMES },
  gsc: GSC_OUTCOME_RULES,
  housekeeping: { healthy: HOUSEKEEPING_HEALTHY_OUTCOMES },
} as const satisfies Record<keyof CronStatuses, OutcomeRules>;

export function deriveCronStatuses(crons: CronSignals, now: Date): CronStatuses {
  const lastFor = (action: UsageAction) =>
    crons.lastRuns.find((run) => run.action === action) ?? null;
  return {
    price: deriveCronStatus({
      lastRun: lastFor('cron_prices'),
      outcomes: crons.priceOutcomes,
      ...CRON_OUTCOME_RULES.price,
      expectedEveryHours: 24,
      now,
    }),
    sde: deriveCronStatus({
      lastRun: lastFor('cron_sde'),
      outcomes: crons.sdeOutcomes,
      ...CRON_OUTCOME_RULES.sde,
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
    housekeeping: deriveCronStatus({
      lastRun: lastFor('cron_housekeeping'),
      outcomes: crons.housekeepingOutcomes,
      ...CRON_OUTCOME_RULES.housekeeping,
      expectedEveryHours: 24,
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

export function sliLevel(key: keyof SliSignals, value: Loaded<number | null>): StatusLevel {
  if (value === SECTION_LOAD_FAILED || value === null || Number.isNaN(value)) return 'neutral';
  const target = SLI_TARGETS[key];
  const breaches = (limit: number) =>
    target.direction === 'min' ? value < limit : value > limit;
  if (breaches(target.fail)) return 'red';
  if (breaches(target.warn)) return 'amber';
  return 'green';
}

export function formatSliValue(key: keyof SliSignals, value: Loaded<number | null>): string {
  if (value === SECTION_LOAD_FAILED) return 'unavailable';
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
function splitHeadline(status: SubsystemStatus): { value: string; note: string } {
  const [value = '', ...rest] = status.headline.split(' · ');
  return { value, note: rest.join(' · ') };
}

function sliLine(id: keyof SliSignals, label: string, sli: Loaded<SliSignals>): StatusLine {
  if (sli === SECTION_LOAD_FAILED) return unavailableLine(id, label);
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
    return { level: 'red', value: 'unavailable', note: 'dispatch paused' };
  }
  const below = budget.effectiveRemaining < ESI_BUDGET_FLOOR;
  return {
    level: below ? 'red' : 'green',
    value: `${budget.effectiveRemaining.toLocaleString()} left`,
    note: below
      ? `floor ${ESI_BUDGET_FLOOR} · dispatch paused`
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
    value: `${queue.due.toLocaleString()} active · ${queue.deadLettered.toLocaleString()} dead`,
    note:
      queue.oldestDueHours === null
        ? ''
        : `oldest job ${formatHours(queue.oldestDueHours)}`,
    level: queueLevel(queue),
    quiet: true,
  };
}

function cronLine(id: string, label: string, status: SubsystemStatus): StatusLine {
  const headline = splitHeadline(status);
  return { id, label, ...headline, level: status.level, quiet: headline.value === 'recovered' };
}

type Release = { date: string; label: string };

function releaseLine(releases: Loaded<Release[]>, now: Date): StatusLine {
  if (releases === SECTION_LOAD_FAILED) return unavailableLine('release', 'Latest release');
  const latest = releases.reduce<Release | null>(
    (best, release) => (best === null || release.date > best.date ? release : best),
    null,
  );
  if (latest === null) {
    return { id: 'release', label: 'Latest release', value: 'none', note: '', level: 'neutral' };
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

function heldForBudgetLine(stats: Loaded<EsiRefreshQueueStat[]>): StatusLine {
  if (stats === SECTION_LOAD_FAILED) return unavailableLine('held-for-budget', 'Held for budget');
  const held = stats
    .filter((stat) => stat.status === 'deferred_for_budget')
    .reduce((total, stat) => total + stat.count, 0);
  return {
    id: 'held-for-budget',
    label: 'Held for budget',
    value: `${held.toLocaleString()} job${held === 1 ? '' : 's'}`,
    note: '',
    level: held > 0 ? 'amber' : 'green',
    quiet: true,
  };
}

function priceSourceLine(signals: AdminSignals): StatusLine {
  const { fallback, budgetExhaustions } = signals;
  if (fallback === SECTION_LOAD_FAILED || budgetExhaustions === SECTION_LOAD_FAILED) {
    return unavailableLine('price-source', 'Price source');
  }
  const status = deriveEsiSourceStatus({ fallback, budgetExhaustions });
  const { value, note } = splitHeadline(status);
  // Some Fuzzwork fallback is the design working; only a majority fallback needs you.
  return { id: 'price-source', label: 'Price source', value, note, level: status.level, quiet: status.level !== 'red' };
}

function budgetLine(budget: Loaded<EsiBudgetSnapshot | null>): StatusLine {
  if (budget === SECTION_LOAD_FAILED) return unavailableLine('budget', 'Error budget');
  return { id: 'budget', label: 'Error budget', ...deriveBudgetStatus(budget) };
}

function cronLines(signals: AdminSignals): StatusLine[] {
  const rows = [
    ['cron-prices', 'Price cron', 'price'],
    ['cron-sde', 'SDE cron', 'sde'],
    ['cron-gsc', 'GSC sync', 'gsc'],
    ['cron-housekeeping', 'Housekeeping', 'housekeeping'],
  ] as const;
  if (signals.crons === SECTION_LOAD_FAILED) return rows.map(([id, label]) => unavailableLine(id, label));
  const crons = deriveCronStatuses(signals.crons, signals.now);
  return rows.map(([id, label, key]) => cronLine(id, label, crons[key]));
}

function queueStatusLine(signals: AdminSignals): StatusLine {
  if (signals.queue === SECTION_LOAD_FAILED) return unavailableLine('queue', 'Refresh queue');
  return queueLine(summarizeQueue(signals.queue, signals.now));
}

export function deriveStatusGroups(signals: AdminSignals): StatusGroup[] {
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
        budgetLine(signals.budget),
        sliLine('esiSuccess', 'ESI availability', signals.sli),
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
        ...cronLines(signals),
        queueStatusLine(signals),
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
  if (statics === null || statics === SECTION_LOAD_FAILED) return [];
  return [
    {
      id: 'statics',
      level: 'amber',
      title: `Wormhole statics feed v${statics.feedVersion} is waiting for review`,
      detail: `${statics.totalDifferences.toLocaleString()} assignment differences`,
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
      detail: 'Refresh stopped',
      action: { label: 'Open queue', href: '/admin/queue' },
    });
  }
  if (queue.oldestDueHours !== null && queue.oldestDueHours > QUEUE_STALE_HOURS) {
    items.push({
      id: 'queue-backlog',
      level: 'amber',
      title: `Refresh backlog of ${queue.due.toLocaleString()} jobs, oldest ${formatHours(queue.oldestDueHours)}`,
      detail: `target ≤ ${QUEUE_STALE_HOURS}h`,
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

function unavailableAttention(signals: AdminSignals): AttentionItem[] {
  const keys = Object.keys(SOURCES) as (keyof typeof SOURCES)[];
  const byPage = new Map<string, { page: AttentionItem['action']; labels: Set<string> }>();
  for (const key of keys) {
    if (signals[key] !== SECTION_LOAD_FAILED) continue;
    const { label, page } = SOURCES[key];
    const entry = byPage.get(page.href) ?? { page, labels: new Set<string>() };
    entry.labels.add(label);
    byPage.set(page.href, entry);
  }
  return [...byPage.values()].map(({ page, labels }) => ({
    id: `unavailable:${page.href}`,
    level: 'amber',
    title: `Could not load ${[...labels].join(', ')}`,
    detail: 'Status unknown',
    action: page,
  }));
}

export function deriveAttention(signals: AdminSignals, groups: StatusGroup[]): AttentionItem[] {
  const actionFor: Record<StatusGroup['id'], AttentionItem['action']> = {
    app: HEALTH_PAGE,
    esi: ESI_PAGE,
    jobs: { label: 'View jobs', href: '/admin/health#scheduled' },
  };
  const statusItems = groups.flatMap((group) =>
    group.lines.flatMap((line) => lineAttention(line, actionFor[group.id])),
  );
  const items = [
    ...statusItems,
    ...(signals.queue === SECTION_LOAD_FAILED ? [] : queueAttention(summarizeQueue(signals.queue, signals.now))),
    ...staticsAttention(signals.statics),
    ...unavailableAttention(signals),
  ];
  return [...items.filter((i) => i.level === 'red'), ...items.filter((i) => i.level === 'amber')];
}
