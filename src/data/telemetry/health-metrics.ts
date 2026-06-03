// Pure derivations for the admin Health/SEO/Users dashboard (3.2.13). The
// queries emit raw counts; everything here — ratios, bucketing, and the
// one-line summaries — is computed in TS so it can be unit-tested at the edge
// values the dashboard must read correctly at (empty window, 0%, 100%).

import type {
  CronOutcomeCount,
  DegradationCallerCount,
  FallbackRateData,
  RefreshVolumePoint,
  ReturningVsNew,
  SearchVsDirect,
} from './types';

// ── Cron health classification ──────────────────────────────────────────
// The healthy/neutral outcome sets are the single source of truth for the
// "Cron health — X%" headline. `cron_prices` never writes a failure row (a
// crash writes nothing), so its only outcomes are healthy. `cron_sde` busy is
// a benign lock-contention skip — excluded from the denominator rather than
// counted against health; remote-unreachable is genuinely unhealthy.
export const PRICES_HEALTHY_OUTCOMES = ['refreshed', 'skipped'] as const;
export const SDE_HEALTHY_OUTCOMES = ['up-to-date', 'reingested'] as const;
export const SDE_NEUTRAL_OUTCOMES = ['busy'] as const;

type Health = 'healthy' | 'neutral' | 'unhealthy';

function classify(
  outcome: string,
  healthy: readonly string[],
  neutral: readonly string[],
): Health {
  if (healthy.includes(outcome)) return 'healthy';
  if (neutral.includes(outcome)) return 'neutral';
  return 'unhealthy';
}

export interface CronHealth {
  healthy: number;
  unhealthy: number;
  neutral: number;
  /** Runs counted toward the ratio (healthy + unhealthy; neutral excluded). */
  total: number;
  /** healthy / total, or null when no run counts toward the ratio. */
  ratio: number | null;
}

export function summarizeCronHealth(
  prices: CronOutcomeCount[],
  sde: CronOutcomeCount[],
): CronHealth {
  let healthy = 0;
  let unhealthy = 0;
  let neutral = 0;

  const tally = (
    rows: CronOutcomeCount[],
    healthySet: readonly string[],
    neutralSet: readonly string[],
  ) => {
    for (const r of rows) {
      const kind = classify(r.outcome, healthySet, neutralSet);
      if (kind === 'healthy') healthy += r.count;
      else if (kind === 'neutral') neutral += r.count;
      else unhealthy += r.count;
    }
  };

  tally(prices, PRICES_HEALTHY_OUTCOMES, []);
  tally(sde, SDE_HEALTHY_OUTCOMES, SDE_NEUTRAL_OUTCOMES);

  const total = healthy + unhealthy;
  return { healthy, unhealthy, neutral, total, ratio: total === 0 ? null : healthy / total };
}

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
// fabricate a denominator that doesn't exist (CLAUDE.md: trivially-true).

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

export function cronHealthSummary(h: CronHealth): string {
  if (h.total === 0 && h.neutral === 0) return 'No cron runs recorded this period.';
  if (h.total === 0) {
    return `${h.neutral} run${h.neutral === 1 ? '' : 's'} skipped while another ingest held the lock; none failed.`;
  }
  if (h.ratio === 1) return 'Every recorded cron run completed healthy.';
  return `${h.healthy} of ${h.total} cron runs completed healthy; ${h.unhealthy} need attention.`;
}

export function returningVsNewSummary({ newUsers, returning }: ReturningVsNew): string {
  const total = newUsers + returning;
  if (total === 0) return 'No sign-ins recorded this period.';
  if (returning === 0) {
    return `${newUsers} new sign-in${newUsers === 1 ? '' : 's'}; no returning users this period.`;
  }
  if (newUsers === 0) {
    return `${returning} returning user${returning === 1 ? '' : 's'}; no new sign-ins this period.`;
  }
  return `${returning} returning and ${newUsers} new this period.`;
}

export function searchVsDirectSummary({ referred, direct }: SearchVsDirect): string {
  const total = referred + direct;
  if (total === 0) return 'No page views recorded this period.';
  if (referred === 0) return 'All page views were direct or same-site this period.';
  const pct = Math.round((referred / total) * 100);
  return `${pct}% of page views arrived with an external referrer.`;
}
