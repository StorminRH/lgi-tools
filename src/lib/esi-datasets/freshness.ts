// The registry leaf owns only freshness verdicts and windows. The three
// trigger layers above it deliberately stay separate: market prices coalesce a
// live fetch and degrade to a second source, market history gates on a persisted
// response boundary, and owner sync uses a durable retry queue. Combining those
// budget, retry, write, and concurrency policies would expose a flag-driven
// temporal shell rather than hide one decision.
import { ESI_DATASET_ENTRIES } from './entries';
import { effectiveTtlMs } from './types';

type StaticWindowEntry = Extract<
  (typeof ESI_DATASET_ENTRIES)[number],
  { freshnessModel: 'caller-ttl' | 'row-stale-after' }
>;

/**
 * The names of registry datasets with a static staleness window: the
 * caller-ttl and row-stale-after models, whose effective TTL is the entry's
 * verified upstream cache time or its recorded override.
 */
export type StaticWindowDatasetName = StaticWindowEntry['name'];

/**
 * A dataset's bound runtime staleness gate. `isStale` is pure and
 * clock-injected: true when the owner was never refreshed or the refresh is
 * older than the entry-derived window. `ttlMs` exposes the same window for
 * write-time stale-after stamps and SQL cutoff arithmetic.
 */
export interface FreshnessGate {
  readonly ttlMs: number;
  isStale(refreshedAt: Date | null, now: Date): boolean;
}

function entryNamed(name: StaticWindowDatasetName): StaticWindowEntry {
  const entry = ESI_DATASET_ENTRIES.find(
    (candidate): candidate is StaticWindowEntry =>
      candidate.name === name
      && (
        candidate.freshnessModel === 'caller-ttl'
        || candidate.freshnessModel === 'row-stale-after'
      ),
  );
  if (entry === undefined) {
    throw new Error(`Missing static freshness entry: ${name}`);
  }
  return entry;
}

/**
 * Returns the staleness gate bound to one statically windowed registry entry.
 * Bound gates preserve the existing `(refreshedAt, now)` caller contract while
 * hiding entry lookup, freshness-model legality, and override resolution.
 */
export function freshnessGate(name: StaticWindowDatasetName): FreshnessGate {
  const ttlMs = effectiveTtlMs(entryNamed(name));
  if (ttlMs === null) {
    throw new Error(`Static freshness entry has no effective TTL: ${name}`);
  }
  return {
    ttlMs,
    isStale: (refreshedAt, now) =>
      refreshedAt === null || now.getTime() - refreshedAt.getTime() > ttlMs,
  };
}

/**
 * Returns whether an expires-boundary dataset needs refresh. A missing row is
 * stale; a persisted boundary remains fresh only while it is strictly later
 * than the injected clock.
 */
export function isBoundaryStale(
  staleAfter: Date | undefined,
  now: Date,
): boolean {
  return staleAfter === undefined || staleAfter.getTime() <= now.getTime();
}
