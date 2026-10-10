import { AsyncLocalStorage } from 'node:async_hooks';
import {
  setDependencyTimingSink,
  type DependencyCall,
  type DependencyKind,
  type DependencyTiming,
} from '@/lib/dependency-timing';
import type { AppFailure, FailureCategory } from '@/lib/failure';

export interface StashedFailure {
  category: FailureCategory;
  code: string;
}

type Interval = readonly [start: number, end: number];

interface DependencyTally {
  ms: number;
  calls: number;
  status4xx: number;
  intervals: Interval[];
}

interface CorrelationScope {
  correlationId: string;
  dependencies: Partial<Record<DependencyKind, DependencyTally>>;
  /** Every call of any kind, so overlapping kinds count once in the union. */
  intervals: Interval[];
  failure: StashedFailure | null;
}

const storage = new AsyncLocalStorage<CorrelationScope>();

let sinkInstalled = false;

function installDependencySink(): void {
  if (sinkInstalled) return;
  sinkInstalled = true;
  setDependencyTimingSink((kind, ms, call) => {
    const scope = storage.getStore();
    if (scope === undefined) return;
    recordCall(scope, kind, ms, call);
  });
}

/** A 4xx other than 420/429, which callers already record as rate limiting. */
function isClientError(status: number): boolean {
  return status >= 400 && status < 500 && status !== 420 && status !== 429;
}

function recordCall(
  scope: CorrelationScope,
  kind: DependencyKind,
  ms: number,
  call: DependencyCall | undefined,
): void {
  const end = performance.now();
  const interval: Interval = [end - ms, end];
  const tally = (scope.dependencies[kind] ??= { ms: 0, calls: 0, status4xx: 0, intervals: [] });
  tally.ms += ms;
  tally.calls += 1;
  if (call?.status !== undefined && isClientError(call.status)) tally.status4xx += 1;
  tally.intervals.push(interval);
  scope.intervals.push(interval);
}

/** Total length covered by the intervals, counting overlaps once. */
function unionMs(intervals: readonly Interval[]): number {
  const sorted = [...intervals].sort((left, right) => left[0] - right[0]);
  let total = 0;
  let coveredTo = Number.NEGATIVE_INFINITY;
  for (const [start, end] of sorted) {
    if (end <= coveredTo) continue;
    total += end - Math.max(start, coveredTo);
    coveredTo = end;
  }
  return total;
}

function snapshotTally(tally: DependencyTally): DependencyTiming {
  return {
    ms: tally.ms,
    calls: tally.calls,
    wallMs: unionMs(tally.intervals),
    ...(tally.status4xx > 0 ? { status4xx: tally.status4xx } : {}),
  };
}

export function withCorrelationScope<T>(work: () => Promise<T>): Promise<T> {
  installDependencySink();
  return storage.run(
    { correlationId: crypto.randomUUID(), dependencies: {}, intervals: [], failure: null },
    work,
  );
}

export function currentCorrelationId(): string {
  return storage.getStore()?.correlationId ?? crypto.randomUUID();
}

/** A detached copy, so work that finishes after the snapshot cannot change it. */
export function currentDependencyTimings(): Partial<Record<DependencyKind, DependencyTiming>> {
  const dependencies = storage.getStore()?.dependencies ?? {};
  const snapshot: Partial<Record<DependencyKind, DependencyTiming>> = {};
  for (const [kind, tally] of Object.entries(dependencies) as [DependencyKind, DependencyTally][]) {
    snapshot[kind] = snapshotTally(tally);
  }
  return snapshot;
}

/** Elapsed time with any dependency call in flight; 0 when nothing was timed. */
export function currentDependencyWallMs(): number {
  return unionMs(storage.getStore()?.intervals ?? []);
}

export function stashFailure(failure: AppFailure): void {
  const scope = storage.getStore();
  if (scope === undefined) return;
  scope.failure = { category: failure.category, code: failure.code };
}

export function currentStashedFailure(): StashedFailure | null {
  return storage.getStore()?.failure ?? null;
}
