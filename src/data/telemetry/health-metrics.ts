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
  return `Refreshed on ${points.length} day${points.length === 1 ? '' : 's'}, writing ${written.toLocaleString()} of ${fetched.toLocaleString()} fetched rows.`;
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

export interface SubsystemStatus {
  level: StatusLevel;
  headline: string;
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
  if (!lastRun) return { level: 'red', headline: 'never ran' };

  const ago = formatAgo(lastRun.timestamp, now);
  const ageHours = (now.getTime() - lastRun.timestamp.getTime()) / 3_600_000;
  const lastKind = classifyOutcome(lastRun.outcome, input);

  if (lastKind === 'unhealthy') {
    return { level: 'red', headline: `failing · ${lastRun.outcome ?? 'unknown outcome'} ${ago}` };
  }
  if (ageHours > expectedEveryHours * STALE_RED_FACTOR) {
    return { level: 'red', headline: `stale · last run ${ago}` };
  }
  if (lastKind === 'degraded') {
    return { level: 'amber', headline: `degraded · ${lastRun.outcome} ${ago}` };
  }
  if (ageHours > expectedEveryHours * STALE_AMBER_FACTOR) {
    return { level: 'amber', headline: `late · last run ${ago}` };
  }

  const failures = outcomes
    .filter((o) => classifyOutcome(o.outcome, input) === 'unhealthy')
    .reduce((s, o) => s + o.count, 0);
  if (failures > 0) {
    return {
      level: 'amber',
      headline: `recovered · ${failures} failed run${failures === 1 ? '' : 's'} this period, latest healthy ${ago}`,
    };
  }
  return { level: 'green', headline: `healthy · last run ${ago}` };
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
    return { level: 'neutral', headline: 'not connected' };
  }
  const base = deriveCronStatus({
    lastRun: input.lastRun,
    outcomes: input.outcomes,
    ...GSC_OUTCOME_RULES,
    expectedEveryHours: 24,
    now: input.now,
  });
  if (base.level === 'green' && input.lastSyncedAt) {
    return {
      level: 'green',
      headline: `${base.headline} · last synced ${input.lastSyncedAt.toISOString().slice(0, 10)}`,
    };
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
  if (denom === 0) return { level: 'neutral', headline: 'idle · no price refreshes this period' };

  const rate = fallback.fallback / denom;
  const ratePct = rate * 100 < 1 && rate > 0 ? '<1%' : `${Math.round(rate * 100)}%`;
  if (rate > FALLBACK_RED_RATE) {
    return { level: 'red', headline: `degraded · Fuzzwork covered ${ratePct} of priced items` };
  }
  if (fallback.fallback > 0 || budgetExhaustions > 0) {
    const parts: string[] = [];
    if (fallback.fallback > 0) parts.push(`${ratePct} fallback`);
    if (budgetExhaustions > 0) {
      parts.push(`${budgetExhaustions} budget exhaustion${budgetExhaustions === 1 ? '' : 's'}`);
    }
    return { level: 'amber', headline: `partial · ${parts.join(' · ')}` };
  }
  return { level: 'green', headline: 'healthy · ESI served every priced item this period' };
}

export function fallbackRatePoints(
  perDay: ReadonlyArray<{ esi: number; fallback: number }>,
): number[] {
  return perDay.map((p) =>
    p.esi + p.fallback === 0 ? 0 : Math.round((p.fallback / (p.esi + p.fallback)) * 100),
  );
}
