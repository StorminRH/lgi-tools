import { AsyncLocalStorage } from 'node:async_hooks';
import {
  setDependencyTimingSink,
  type DependencyKind,
  type DependencyTiming,
} from '@/lib/dependency-timing';
import type { AppFailure, FailureCategory } from '@/lib/failure';

export interface StashedFailure {
  category: FailureCategory;
  code: string;
}

interface CorrelationScope {
  correlationId: string;
  dependencies: Partial<Record<DependencyKind, DependencyTiming>>;
  failure: StashedFailure | null;
}

const storage = new AsyncLocalStorage<CorrelationScope>();

let sinkInstalled = false;

function installDependencySink(): void {
  if (sinkInstalled) return;
  sinkInstalled = true;
  setDependencyTimingSink((kind, ms) => {
    const scope = storage.getStore();
    if (scope === undefined) return;
    const existing = scope.dependencies[kind];
    if (existing === undefined) {
      scope.dependencies[kind] = { ms, calls: 1 };
      return;
    }
    existing.ms += ms;
    existing.calls += 1;
  });
}

export function withCorrelationScope<T>(work: () => Promise<T>): Promise<T> {
  installDependencySink();
  return storage.run(
    { correlationId: crypto.randomUUID(), dependencies: {}, failure: null },
    work,
  );
}

export function currentCorrelationId(): string {
  return storage.getStore()?.correlationId ?? crypto.randomUUID();
}

export function currentDependencyTimings(): Partial<Record<DependencyKind, DependencyTiming>> {
  return storage.getStore()?.dependencies ?? {};
}

export function stashFailure(failure: AppFailure): void {
  const scope = storage.getStore();
  if (scope === undefined) return;
  scope.failure = { category: failure.category, code: failure.code };
}

export function currentStashedFailure(): StashedFailure | null {
  return storage.getStore()?.failure ?? null;
}
