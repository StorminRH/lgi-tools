import { formatCount, formatQuantity } from '@/lib/format/number';
import { formatIsoDay } from '@/lib/format/time';
import type {
  CronOutcomeCount,
  FallbackRateData,
  RefreshVolumePoint,
} from './types';

export const PRICES_HEALTHY_OUTCOMES = ['refreshed', 'skipped'] as const;
export const SDE_HEALTHY_OUTCOMES = ['up-to-date', 'reingested'] as const;
export const SDE_NEUTRAL_OUTCOMES = ['busy'] as const;
export const HOUSEKEEPING_HEALTHY_OUTCOMES = ['cleaned'] as const;

export interface LoginFrequencyBucket {
  label: string;
  users: number;
}

const LOGIN_BUCKETS: { label: string; test: (n: number) => boolean }[] = [
  { label: '1', test: (n) => n === 1 },
  { label: '2–3', test: (n) => n >= 2 && n <= 3 },
  { label: '4–9', test: (n) => n >= 4 && n <= 9 },
  { label: '10+', test: (n) => n >= 10 },
];

export function loginFrequencyBuckets(counts: number[]): LoginFrequencyBucket[] {
  return LOGIN_BUCKETS.map((b) => ({
    label: b.label,
    users: counts.filter((c) => b.test(c)).length,
  }));
}

export function refreshVolumeSummary(points: RefreshVolumePoint[]): string {
  if (points.length === 0) return 'No price refreshes recorded this period.';
  const fetched = points.reduce((s, p) => s + p.fetched, 0);
  const written = points.reduce((s, p) => s + p.written, 0);
  return `Refreshed on ${formatCount(points.length, 'day')}, writing ${formatQuantity(written)} of ${formatQuantity(fetched)} fetched rows.`;
}

export type StatusLevel = 'green' | 'amber' | 'red' | 'neutral';

/** An operator alert line: a breach of `warn` is amber, of `fail` red. */
export interface AlertTarget {
  warn: number;
  fail: number;
  direction: 'min' | 'max';
}

/** The share of ESI-dependent operations that must succeed. */
export const ESI_AVAILABILITY_TARGET = {
  warn: 0.95,
  fail: 0.8,
  direction: 'min',
} as const satisfies AlertTarget;

export function targetLevel(value: number, target: AlertTarget): Exclude<StatusLevel, 'neutral'> {
  const breaches = (limit: number) =>
    target.direction === 'min' ? value < limit : value > limit;
  if (breaches(target.fail)) return 'red';
  if (breaches(target.warn)) return 'amber';
  return 'green';
}

/**
 * A subsystem's verdict, already split for a status row: `value` is the
 * short state or figure for the value column ("healthy", "late", "5 left"),
 * `note` the detail under the label. `quiet` marks amber that informs
 * rather than asks for action, such as a cron that failed and recovered.
 */
export interface SubsystemStatus {
  level: StatusLevel;
  value: string;
  note?: string;
  quiet?: boolean;
}

export const GSC_OUTCOME_RULES = {
  healthy: ['synced'],
  neutral: ['skipped'],
  degraded: ['partial'],
} as const satisfies OutcomeRules;

const STALE_AMBER_FACTOR = 1.25;
const STALE_RED_FACTOR = 2;

export function formatAgo(then: Date, now: Date): string {
  const ms = now.getTime() - then.getTime();
  if (ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export interface OutcomeRules {
  healthy: readonly string[];
  neutral?: readonly string[];
  degraded?: readonly string[];
}

export interface CronStatusInput extends OutcomeRules {
  lastRun: { timestamp: Date; outcome: string | null } | null;
  outcomes: CronOutcomeCount[];
  expectedEveryHours: number;
  now: Date;
}

export type OutcomeKind = 'healthy' | 'neutral' | 'degraded' | 'unhealthy';

export function classifyOutcome(
  outcome: string | null,
  { healthy, neutral = [], degraded = [] }: OutcomeRules,
): OutcomeKind {
  if (outcome === null) return 'unhealthy';
  if (healthy.includes(outcome)) return 'healthy';
  if (neutral.includes(outcome)) return 'neutral';
  if (degraded.includes(outcome)) return 'degraded';
  return 'unhealthy';
}

export function deriveCronStatus(input: CronStatusInput): SubsystemStatus {
  const { lastRun, outcomes, expectedEveryHours, now } = input;
  if (!lastRun) return { level: 'red', value: 'never ran' };

  const ago = formatAgo(lastRun.timestamp, now);
  const ageHours = (now.getTime() - lastRun.timestamp.getTime()) / 3_600_000;
  const lastKind = classifyOutcome(lastRun.outcome, input);

  if (lastKind === 'unhealthy') {
    return { level: 'red', value: 'failing', note: `${lastRun.outcome ?? 'unknown outcome'} ${ago}` };
  }
  if (ageHours > expectedEveryHours * STALE_RED_FACTOR) {
    return { level: 'red', value: 'stale', note: `last run ${ago}` };
  }
  if (lastKind === 'degraded') {
    return { level: 'amber', value: 'degraded', note: `${lastRun.outcome} ${ago}` };
  }
  if (ageHours > expectedEveryHours * STALE_AMBER_FACTOR) {
    return { level: 'amber', value: 'late', note: `last run ${ago}` };
  }

  const failures = outcomes
    .filter((o) => classifyOutcome(o.outcome, input) === 'unhealthy')
    .reduce((s, o) => s + o.count, 0);
  if (failures > 0) {
    return {
      level: 'amber',
      value: 'recovered',
      note: `${formatCount(failures, 'failed run')} this period, latest healthy ${ago}`,
      quiet: true,
    };
  }
  return { level: 'green', value: 'healthy', note: `last run ${ago}` };
}

export interface GscStatusInput {
  configured: boolean;
  lastRun: { timestamp: Date; outcome: string | null } | null;
  outcomes: CronOutcomeCount[];
  lastSyncedAt: Date | null;
  now: Date;
}

export function deriveGscStatus(input: GscStatusInput): SubsystemStatus {
  if (!input.configured) {
    return { level: 'neutral', value: 'not connected' };
  }
  const base = deriveCronStatus({
    lastRun: input.lastRun,
    outcomes: input.outcomes,
    ...GSC_OUTCOME_RULES,
    expectedEveryHours: 24,
    now: input.now,
  });
  if (base.level === 'green' && input.lastSyncedAt) {
    return { ...base, note: `${base.note} · last synced ${formatIsoDay(input.lastSyncedAt)}` };
  }
  return base;
}

export interface EsiSourceStatusInput {
  fallback: FallbackRateData;
  budgetExhaustions: number;
}

const FALLBACK_RED_RATE = 0.5;

export function deriveEsiSourceStatus({
  fallback,
  budgetExhaustions,
}: EsiSourceStatusInput): SubsystemStatus {
  const denom = fallback.esi + fallback.fallback;
  if (denom === 0) return { level: 'neutral', value: 'idle', note: 'no price refreshes this period' };

  const rate = fallback.fallback / denom;
  const ratePct = rate * 100 < 1 && rate > 0 ? '<1%' : `${Math.round(rate * 100)}%`;
  if (rate > FALLBACK_RED_RATE) {
    return { level: 'red', value: 'degraded', note: `Fuzzwork covered ${ratePct} of priced items` };
  }
  if (fallback.fallback > 0 || budgetExhaustions > 0) {
    const parts: string[] = [];
    if (fallback.fallback > 0) parts.push(`${ratePct} fallback`);
    if (budgetExhaustions > 0) parts.push(formatCount(budgetExhaustions, 'budget exhaustion'));
    return { level: 'amber', value: 'partial', note: parts.join(' · ') };
  }
  return { level: 'green', value: 'healthy', note: 'ESI served every priced item this period' };
}

export function fallbackRatePoints(
  perDay: ReadonlyArray<{ esi: number; fallback: number }>,
): number[] {
  return perDay.map((p) =>
    p.esi + p.fallback === 0 ? 0 : Math.round((p.fallback / (p.esi + p.fallback)) * 100),
  );
}
