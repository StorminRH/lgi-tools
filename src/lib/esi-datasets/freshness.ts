import { ESI_DATASET_ENTRIES } from './entries';
import { effectiveTtlMs } from './types';

export type StaticWindowEntry = Extract<
  (typeof ESI_DATASET_ENTRIES)[number],
  { freshnessModel: 'caller-ttl' | 'row-stale-after' }
>;

export type StaticWindowDatasetName = StaticWindowEntry['name'];

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

export function isBoundaryStaleMs(
  staleAfterMs: number,
  nowMs: number,
): boolean {
  return staleAfterMs <= nowMs;
}

export function isBoundaryStale(
  staleAfter: Date | undefined,
  now: Date,
): boolean {
  return (
    staleAfter === undefined
    || isBoundaryStaleMs(staleAfter.getTime(), now.getTime())
  );
}
