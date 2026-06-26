// Pure derivations for the admin Health/SEO/Users dashboard (3.2.13). The
// queries emit raw counts; everything here — ratios, bucketing, and the
// one-line summaries — is computed in TS so it can be unit-tested at the edge
// values the dashboard must read correctly at (empty window, 0%, 100%).

import type {
  CronOutcomeCount,
  DegradationCallerCount,
  FallbackRateData,
  RefreshVolumePoint,
} from './types';

// ── Cron outcome vocabulary ─────────────────────────────────────────────
// The healthy/neutral outcome sets are the single source of truth for the
// status strip's classification. `cron_prices` never writes a failure row (a
// crash writes nothing), so its only outcomes are healthy. `cron_sde` busy is
// a benign lock-contention skip — not counted against health;
// remote-unreachable is genuinely unhealthy.
export const PRICES_HEALTHY_OUTCOMES = ['refreshed', 'skipped'] as const;
export const SDE_HEALTHY_OUTCOMES = ['up-to-date', 'reingested'] as const;
export const SDE_NEUTRAL_OUTCOMES = ['busy'] as const;

// ── Login-frequency histogram ───────────────────────────────────────────
// Bucket edges are presentation, so bucketing happens here, not in SQL. Input
// is a bare per-user login-count list — no identity reaches this function.
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

// ── Ratio + formatting ──────────────────────────────────────────────────

/** Guarded ratio: null when the denominator is zero (an empty window). */
export function ratio(num: number, denom: number): number | null {
  return denom === 0 ? null : num / denom;
}

/** A null ratio (empty window) renders as `empty`; a real 0 renders as "0%". */
export function formatPct(r: number | null, empty = '—'): string {
  return r === null ? empty : `${Math.round(r * 100)}%`;
}

// ── Edge-safe one-line summaries ────────────────────────────────────────
// Each reads sensibly at an empty window, a real 0%, and 100%. They never
// fabricate a denominator that doesn't exist (a trivially-true denominator).

export function fallbackSummary({ esi, fallback }: FallbackRateData): string {
  const denom = esi + fallback;
  if (denom === 0) return 'No price refreshes recorded this period.';
  if (fallback === 0) return 'ESI served every priced item this period.';
  const pct = Math.round((fallback / denom) * 100);
  return `Fuzzwork covered ${pct}% of priced items when ESI was unavailable.`;
}

export function budgetSummary(count: number): string {
  if (count === 0) return 'ESI stayed within its error budget all period.';
  return `ESI hit its error-budget floor ${count} time${count === 1 ? '' : 's'}, falling back to Fuzzwork.`;
}

export function degradationCallerSummary(rows: DegradationCallerCount[]): string {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0) return 'No price-source degradation events this period.';
  const parts = rows.map((r) => `${r.count} ${r.caller}`).join(', ');
  return `${total} degradation event${total === 1 ? '' : 's'} this period (${parts}).`;
}

export function refreshVolumeSummary(points: RefreshVolumePoint[]): string {
  if (points.length === 0) return 'No price refreshes recorded this period.';
  const fetched = points.reduce((s, p) => s + p.fetched, 0);
  const written = points.reduce((s, p) => s + p.written, 0);
  return `Refreshed on ${points.length} day${points.length === 1 ? '' : 's'}, writing ${written.toLocaleString()} of ${fetched.toLocaleString()} fetched rows.`;
}

// ── Subsystem status derivation (3.4.2) ─────────────────────────────────
// The dashboard's status strip reduces each subsystem to one of four levels
// plus a plain-English headline. Levels are presentation-agnostic (the route
// maps them to dot colors); thresholds are pinned by tests.

export type StatusLevel = 'green' | 'amber' | 'red' | 'neutral';

export interface SubsystemStatus {
  level: StatusLevel;
  headline: string;
}

// GSC sync outcomes (`summary.status` from the daily cron): `synced` is clean,
// `skipped` is a benign no-op, `partial` completed with errors, `failed` failed.
export const GSC_HEALTHY_OUTCOMES = ['synced'] as const;
export const GSC_NEUTRAL_OUTCOMES = ['skipped'] as const;
export const GSC_DEGRADED_OUTCOMES = ['partial'] as const;

// Staleness slack over the schedule interval before a cron reads as late
// (amber) or down (red). Crons drift by minutes run-to-run, so 1.25× absorbs
// jitter; past 2× a whole cycle has been missed.
const STALE_AMBER_FACTOR = 1.25;
const STALE_RED_FACTOR = 2;

/** Compact "2h ago"-style age for status headlines. */
export function formatAgo(then: Date, now: Date): string {
  const ms = now.getTime() - then.getTime();
  if (ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export interface CronStatusInput {
  /** Latest recorded run, regardless of the dashboard range. Null = never ran. */
  lastRun: { timestamp: Date; outcome: string | null } | null;
  /** Range-scoped outcome rollup, for "N failed runs this period" context. */
  outcomes: CronOutcomeCount[];
  healthy: readonly string[];
  neutral?: readonly string[];
  /** Outcomes that completed but not cleanly (e.g. GSC `partial`) — amber. */
  degraded?: readonly string[];
  /** Schedule interval — 24 for the daily crons (including SDE). */
  expectedEveryHours: number;
  now: Date;
}

type OutcomeKind = 'healthy' | 'neutral' | 'degraded' | 'unhealthy';

function classifyOutcome(
  outcome: string | null,
  { healthy, neutral = [], degraded = [] }: Pick<CronStatusInput, 'healthy' | 'neutral' | 'degraded'>,
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
  /** Newest syncedAt across the GSC tables — what the data is current through. */
  lastSyncedAt: Date | null;
  now: Date;
}

// Takes lastSyncedAt as a plain Date so this slice never imports gsc —
// cross-slice composition stays at the route level.
export function deriveGscStatus(input: GscStatusInput): SubsystemStatus {
  if (!input.configured) {
    return { level: 'neutral', headline: 'not connected · set GSC env vars to sync search data' };
  }
  const base = deriveCronStatus({
    lastRun: input.lastRun,
    outcomes: input.outcomes,
    healthy: GSC_HEALTHY_OUTCOMES,
    neutral: GSC_NEUTRAL_OUTCOMES,
    degraded: GSC_DEGRADED_OUTCOMES,
    expectedEveryHours: 24,
    now: input.now,
  });
  if (base.level === 'green' && input.lastSyncedAt) {
    return {
      level: 'green',
      headline: `${base.headline} · data through ${input.lastSyncedAt.toISOString().slice(0, 10)}`,
    };
  }
  return base;
}

export interface EsiSourceStatusInput {
  fallback: FallbackRateData;
  budgetExhaustions: number;
}

// Above this share of priced items served by the Fuzzwork fallback, the ESI
// source reads as down rather than flaky.
const FALLBACK_RED_RATE = 0.5;

export function deriveEsiSourceStatus({
  fallback,
  budgetExhaustions,
}: EsiSourceStatusInput): SubsystemStatus {
  const denom = fallback.esi + fallback.fallback;
  if (denom === 0) return { level: 'neutral', headline: 'no price refreshes this period' };

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
  return { level: 'green', headline: 'ESI served every priced item this period' };
}
