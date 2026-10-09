import { getOrInsertComputed } from '@/lib/array';
import type { DependencyKind } from '@/lib/dependency-timing';
import { operationsOfKind, type CapabilityKind } from './capability';
import { ESI_FAILURE_OUTCOMES } from './sql';
import type { DateRange } from './types';

// Service-level figures derived from the two capability reads, so every
// headline and breakdown on a page comes from one scan of the outcomes and
// one of the latencies.

/**
 * One group of recorded capability outcomes. Feature, code, error class and
 * day are filled for outcomes other than `succeeded` only, so successes
 * collapse to one group per operation.
 */
export interface CapabilityOutcomeStat {
  operation: string | null;
  outcome: string | null;
  /** The operation recorded time against ESI. */
  esi: boolean;
  feature: string | null;
  code: string | null;
  errorClass: string | null;
  /** UTC day, `YYYY-MM-DD`. */
  day: string | null;
  count: number;
  lastSeen: Date | null;
}

export interface FailureGroup {
  feature: string | null;
  operation: string | null;
  outcome: string;
  code: string | null;
  errorClass: string | null;
  count: number;
  lastSeen: Date;
}

export interface DailyFailures {
  day: string;
  failures: number;
}

export interface CapabilityFailureDetail {
  groups: FailureGroup[];
  /** Days with at least one failure, in order. */
  daily: DailyFailures[];
  /** Present for kinds that leave invalid input out of their rate. */
  validationRejected?: number;
}

export interface SlowOperation {
  feature: string;
  operation: string;
  p95Ms: number;
  count: number;
  /** The dependency with the most average time per run, or null when none was timed. */
  slowestDependency: DependencyKind | null;
}

/** Latency of one user-facing operation, averaged per run. */
export interface OperationLatency {
  feature: string;
  operation: string;
  p95: number | null;
  count: number;
  dependencyMs: Record<DependencyKind, number | null>;
}

export interface CapabilityLatency {
  p95: number | null;
  slowest: SlowOperation[];
}

export type ServiceKind = Extract<CapabilityKind, 'read' | 'mutation'>;

const BREAKDOWN_LIMIT = 8;
const SLOWEST_LIMIT = 5;
const DEPENDENCY_KINDS = ['neon', 'esi', 'redis'] as const satisfies readonly DependencyKind[];
const ESI_FAILURES = new Set<string>(ESI_FAILURE_OUTCOMES);

/** A rejected bad request is the system working, so it is left out of save/action success. */
const EXCLUDED_OUTCOMES: Record<ServiceKind, readonly string[]> = {
  read: [],
  mutation: ['validation'],
};

function ofKind(rows: readonly CapabilityOutcomeStat[], kind: ServiceKind): CapabilityOutcomeStat[] {
  const operations = new Set<string>(operationsOfKind(kind));
  return rows.filter((row) => row.operation !== null && operations.has(row.operation));
}

function isFailure(outcome: string | null, kind: ServiceKind): outcome is string {
  return outcome !== null && outcome !== 'succeeded' && !EXCLUDED_OUTCOMES[kind].includes(outcome);
}

function sumCounts(rows: readonly CapabilityOutcomeStat[]): number {
  return rows.reduce((total, row) => total + row.count, 0);
}

/** Succeeded share of one kind's operations, or null when none counted. */
export function capabilitySuccessRate(
  rows: readonly CapabilityOutcomeStat[],
  kind: ServiceKind,
): number | null {
  const own = ofKind(rows, kind);
  const excluded = EXCLUDED_OUTCOMES[kind];
  const counted = sumCounts(own.filter((row) => row.outcome === null || !excluded.includes(row.outcome)));
  if (counted <= 0) return null;
  return sumCounts(own.filter((row) => row.outcome === 'succeeded')) / counted;
}

/** Share of ESI-dependent operations that CCP neither limited nor failed. */
export function esiAvailability(rows: readonly CapabilityOutcomeStat[]): {
  total: number;
  healthy: number;
  rate: number | null;
} {
  const esiRows = rows.filter((row) => row.esi);
  const total = sumCounts(esiRows);
  const healthy = sumCounts(
    esiRows.filter((row) => row.outcome !== null && !ESI_FAILURES.has(row.outcome)),
  );
  return { total, healthy, rate: total > 0 ? healthy / total : null };
}

type FailureKey = Omit<FailureGroup, 'count' | 'lastSeen'>;

function latest(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return b > a ? b : a;
}

/** Merges rows that share a key, then keeps the most frequent, most recent groups. */
function topFailureGroups(
  rows: readonly (CapabilityOutcomeStat & { outcome: string })[],
  keyOf: (row: CapabilityOutcomeStat & { outcome: string }) => FailureKey,
  range: DateRange,
): FailureGroup[] {
  const groups = new Map<string, FailureKey & { count: number; lastSeen: Date | null }>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = getOrInsertComputed(groups, JSON.stringify(key), () => ({ ...key, count: 0, lastSeen: null }));
    group.count += row.count;
    group.lastSeen = latest(group.lastSeen, row.lastSeen);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, lastSeen: group.lastSeen ?? range.to }))
    .sort((a, b) => b.count - a.count || b.lastSeen.getTime() - a.lastSeen.getTime())
    .slice(0, BREAKDOWN_LIMIT);
}

/**
 * Failed operations of one kind, grouped by what failed and how, with
 * failures per day. Outcomes the kind's rate leaves out stay out here too.
 */
export function capabilityFailureDetail(
  rows: readonly CapabilityOutcomeStat[],
  kind: ServiceKind,
  range: DateRange,
): CapabilityFailureDetail {
  const own = ofKind(rows, kind);
  const failures = own.filter((row): row is CapabilityOutcomeStat & { outcome: string } =>
    isFailure(row.outcome, kind),
  );
  const groups = topFailureGroups(
    failures,
    ({ feature, operation, outcome, code, errorClass }) => ({ feature, operation, outcome, code, errorClass }),
    range,
  );
  const byDay = new Map<string, number>();
  for (const row of failures) {
    if (row.day !== null) byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.count);
  }
  const daily = [...byDay]
    .map(([day, count]) => ({ day, failures: count }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
  if (!EXCLUDED_OUTCOMES[kind].includes('validation')) return { groups, daily };
  return {
    groups,
    daily,
    validationRejected: sumCounts(own.filter((row) => row.outcome === 'validation')),
  };
}

/** ESI-dependent operations that CCP rate limited or failed, by operation. */
export function esiFailureGroups(
  rows: readonly CapabilityOutcomeStat[],
  range: DateRange,
): FailureGroup[] {
  const failures = rows.filter((row): row is CapabilityOutcomeStat & { outcome: string } =>
    row.esi && row.outcome !== null && ESI_FAILURES.has(row.outcome),
  );
  return topFailureGroups(
    failures,
    ({ feature, operation, outcome, code }) => ({ feature, operation, outcome, code, errorClass: null }),
    range,
  );
}

function slowestDependency(averages: Record<DependencyKind, number | null>): DependencyKind | null {
  let slowest: DependencyKind | null = null;
  for (const kind of DEPENDENCY_KINDS) {
    const ms = averages[kind];
    if (ms === null || Number.isNaN(ms) || ms <= 0) continue;
    if (slowest === null || ms > (averages[slowest] ?? 0)) slowest = kind;
  }
  return slowest;
}

/** A whole-millisecond p95, or null when the window timed nothing. */
export function roundedP95(p95: number | null | undefined): number | null {
  if (p95 === null || p95 === undefined || Number.isNaN(p95)) return null;
  return Math.round(p95);
}

// Postgres sorts a missing p95 first under `desc`; keep that order.
function byP95Descending(a: OperationLatency, b: OperationLatency): number {
  if (a.p95 === b.p95) return 0;
  if (a.p95 === null) return -1;
  if (b.p95 === null) return 1;
  return b.p95 - a.p95;
}

/** The slowest operations by p95, with where their time went. */
export function slowestOperations(operations: readonly OperationLatency[]): SlowOperation[] {
  return [...operations]
    .sort(byP95Descending)
    .slice(0, SLOWEST_LIMIT)
    .map((row) => ({
      feature: row.feature,
      operation: row.operation,
      p95Ms: Math.round(row.p95 ?? 0),
      count: row.count,
      slowestDependency: slowestDependency(row.dependencyMs),
    }));
}
