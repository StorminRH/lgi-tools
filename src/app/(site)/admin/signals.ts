import {
  capabilitySuccessRate,
  esiAvailability,
  type CapabilityLatency,
  type CapabilityOutcomeStat,
} from '@/data/telemetry/capability-stats';
import {
  type AlertTarget,
  deriveCronStatus,
  deriveEsiSourceStatus,
  deriveGscStatus,
  ESI_AVAILABILITY_TARGET,
  GSC_OUTCOME_RULES,
  HOUSEKEEPING_HEALTHY_OUTCOMES,
  type OutcomeRules,
  PRICES_HEALTHY_OUTCOMES,
  SDE_HEALTHY_OUTCOMES,
  SDE_NEUTRAL_OUTCOMES,
  type StatusLevel,
  type SubsystemStatus,
  targetLevel,
} from '@/data/telemetry/health-metrics';
import type {
  CronLastRun,
  CronOutcomeCount,
  FallbackRateData,
  UsageAction,
} from '@/data/telemetry/types';
import { ESI_BUDGET_FLOOR } from '@/platform/esi';
import type { EsiBudgetSnapshot } from '@/platform/esi/scoreboard';
import { adminHref, SCHEDULED_TASKS_ANCHOR } from './admin-sections';
import { SECTION_LOAD_FAILED } from './load-section';
import { getOrInsertComputed } from '@/lib/array';
import { formatCount, formatPct, formatQuantity } from '@/lib/format/number';
import { DAY_MS } from '@/lib/iso-date';

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

export function mapLoaded<T, U>(value: Loaded<T>, derive: (loaded: T) => U): Loaded<U> {
  return value === SECTION_LOAD_FAILED ? SECTION_LOAD_FAILED : derive(value);
}

/** The capability outcome and latency reads every service level is derived from. */
export interface SliReads {
  outcomes: Loaded<CapabilityOutcomeStat[]>;
  latency: Loaded<CapabilityLatency>;
}

/** The headline service levels from the capability outcome and latency reads. */
export function deriveSliSignals({ outcomes, latency }: SliReads): SliSignals {
  return {
    readSuccess: mapLoaded(outcomes, (rows) => capabilitySuccessRate(rows, 'read')),
    mutationSuccess: mapLoaded(outcomes, (rows) => capabilitySuccessRate(rows, 'mutation')),
    latencyP95: mapLoaded(latency, (read) => read.p95),
    esiSuccess: mapLoaded(outcomes, (rows) => esiAvailability(rows).rate),
  };
}

export interface AdminSignals {
  now: Date;
  crons: Loaded<CronSignals>;
  budget: Loaded<EsiBudgetSnapshot | null>;
  fallback: Loaded<FallbackRateData>;
  budgetExhaustions: Loaded<number>;
  sli: Loaded<SliSignals>;
  statics: Loaded<{ feedVersion: string; totalDifferences: number } | null>;
  releases: Loaded<{ date: string; label: string }[]>;
}

// The page each attention item and unread source sends the operator to.
const PAGE_ACTIONS = {
  health: { label: 'Open health', href: adminHref('health') },
  esi: { label: 'Open ESI', href: adminHref('esi') },
  jobs: { label: 'View jobs', href: adminHref('health', { hash: SCHEDULED_TASKS_ANCHOR }) },
  statics: { label: 'Open statics', href: adminHref('statics') },
  staticsReview: { label: 'Review snapshot', href: adminHref('statics') },
} satisfies Record<string, AttentionItem['action']>;

// Where an operator goes to see a source directly when the overview could not read it.
const SOURCES: Record<Exclude<keyof AdminSignals, 'now'>, { label: string; page: AttentionItem['action'] }> = {
  crons: { label: 'scheduled jobs', page: PAGE_ACTIONS.jobs },
  budget: { label: 'ESI error budget', page: PAGE_ACTIONS.esi },
  fallback: { label: 'price source', page: PAGE_ACTIONS.esi },
  budgetExhaustions: { label: 'price source', page: PAGE_ACTIONS.esi },
  sli: { label: 'service levels', page: PAGE_ACTIONS.health },
  statics: { label: 'statics review', page: PAGE_ACTIONS.statics },
  releases: { label: 'releases', page: PAGE_ACTIONS.health },
};

function unavailableLine(id: string, label: string): StatusLine {
  return { id, label, value: 'unavailable', level: 'neutral' };
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
  esiSuccess: ESI_AVAILABILITY_TARGET,
  latencyP95: { warn: 1500, fail: 3000, direction: 'max' },
} as const satisfies Record<keyof SliSignals, AlertTarget>;

export function sliLevel(key: keyof SliSignals, value: Loaded<number | null>): StatusLevel {
  if (value === SECTION_LOAD_FAILED || value === null || Number.isNaN(value)) return 'neutral';
  return targetLevel(value, SLI_TARGETS[key]);
}

export function formatSliValue(key: keyof SliSignals, value: Loaded<number | null>): string {
  if (value === SECTION_LOAD_FAILED) return 'unavailable';
  if (value === null || Number.isNaN(value)) return 'no data';
  if (key === 'latencyP95') return `${formatQuantity(value)} ms`;
  return formatPct(value * 100);
}

export function sliTargetLabel(key: keyof SliSignals): string {
  const target = SLI_TARGETS[key];
  if (target.direction === 'max') return `≤ ${formatQuantity(target.warn)} ms`;
  return `≥ ${Math.round(target.warn * 100)}%`;
}

/**
 * One row of a status card: a subsystem's verdict under its label. `quiet`
 * keeps it off the attention list: amber that informs rather than asks for
 * action, or a line whose attention item is built elsewhere.
 */
export interface StatusLine extends SubsystemStatus {
  id: string;
  label: string;
}

export type StatusGroupId = 'app' | 'esi' | 'jobs';

export interface StatusGroup {
  id: StatusGroupId;
  lines: StatusLine[];
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

/**
 * The one reading of the ESI error budget against the dispatch floor, for
 * the overview's line and the ESI page's budget card alike.
 */
export function deriveBudgetStatus(budget: EsiBudgetSnapshot | null): SubsystemStatus & { level: 'red' | 'green' } {
  if (budget === null) {
    return { level: 'red', value: 'unavailable', note: 'scoreboard unavailable · dispatch paused' };
  }
  const below = budget.effectiveRemaining < ESI_BUDGET_FLOOR;
  return {
    level: below ? 'red' : 'green',
    value: `${formatQuantity(budget.effectiveRemaining)} left`,
    note: `floor ${ESI_BUDGET_FLOOR} · ${below ? 'dispatch paused' : 'live'}`,
  };
}

type Release = { date: string; label: string };

function releaseLine(releases: Loaded<Release[]>, now: Date): StatusLine {
  if (releases === SECTION_LOAD_FAILED) return unavailableLine('release', 'Latest release');
  const latest = releases.reduce<Release | null>(
    (best, release) => (best === null || release.date > best.date ? release : best),
    null,
  );
  if (latest === null) {
    return { id: 'release', label: 'Latest release', value: 'none', level: 'neutral' };
  }
  const days = Math.max(0, Math.floor((now.getTime() - Date.parse(latest.date)) / DAY_MS));
  return {
    id: 'release',
    label: 'Latest release',
    value: latest.label,
    note: `${latest.date} · ${days === 0 ? 'today' : `${days}d ago`}`,
    level: 'neutral',
  };
}

function priceSourceLine(signals: AdminSignals): StatusLine {
  const { fallback, budgetExhaustions } = signals;
  if (fallback === SECTION_LOAD_FAILED || budgetExhaustions === SECTION_LOAD_FAILED) {
    return unavailableLine('price-source', 'Price source');
  }
  const status = deriveEsiSourceStatus({ fallback, budgetExhaustions });
  // Some Fuzzwork fallback is the design working; only a majority fallback needs you.
  return { id: 'price-source', label: 'Price source', ...status, quiet: status.level !== 'red' };
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
  return rows.map(([id, label, key]) => ({ id, label, ...crons[key] }));
}

const STATUS_GROUP_LINES: Record<StatusGroupId, (signals: AdminSignals) => StatusLine[]> = {
  app: (signals) => [
    sliLine('readSuccess', 'Page & tool reads', signals.sli),
    sliLine('mutationSuccess', 'Mutations', signals.sli),
    sliLine('latencyP95', 'p95 latency', signals.sli),
    releaseLine(signals.releases, signals.now),
  ],
  esi: (signals) => [
    budgetLine(signals.budget),
    sliLine('esiSuccess', 'ESI availability', signals.sli),
    priceSourceLine(signals),
  ],
  jobs: cronLines,
};

/** One status card's lines; each card reads the same request-cached signals. */
export function deriveStatusLines(signals: AdminSignals, id: StatusGroupId): StatusLine[] {
  return STATUS_GROUP_LINES[id](signals);
}

export function deriveStatusGroups(signals: AdminSignals): StatusGroup[] {
  return (['app', 'esi', 'jobs'] as const).map((id) => ({ id, lines: deriveStatusLines(signals, id) }));
}

export interface AttentionItem {
  id: string;
  level: 'red' | 'amber';
  title: string;
  detail?: string;
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
      detail: formatCount(statics.totalDifferences, 'assignment difference'),
      action: PAGE_ACTIONS.staticsReview,
    },
  ];
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
    getOrInsertComputed(byPage, page.href, () => ({ page, labels: new Set() })).labels.add(label);
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
    app: PAGE_ACTIONS.health,
    esi: PAGE_ACTIONS.esi,
    jobs: PAGE_ACTIONS.jobs,
  };
  const statusItems = groups.flatMap((group) =>
    group.lines.flatMap((line) => lineAttention(line, actionFor[group.id])),
  );
  const items = [
    ...statusItems,
    ...staticsAttention(signals.statics),
    ...unavailableAttention(signals),
  ];
  return [...items.filter((i) => i.level === 'red'), ...items.filter((i) => i.level === 'amber')];
}
