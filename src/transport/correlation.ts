// The per-operation ambient scope: one correlation id, one dependency-duration
// accumulator, and one failure stash, shared by everything running inside a
// single instrumented operation.
//
// This is the only `node:async_hooks` consumer in `src/`. It lives in transport
// rather than beside `problem.ts` in lib because `src/lib/problem.ts` is inside
// the Convex production bundle, where importing a `node:` builtin fails the
// post-merge Convex push while leaving `pnpm verify` and CI green. The
// measurement points import the import-free `@/lib/dependency-timing` instead
// and this module installs itself there as the sink.
//
// The failure stash exists because the stable code cannot be recovered from a
// serialized response: `CATEGORY_STATUS` maps a category to a status only, so a
// 409 recovers `'conflict'` but never `'template_limit'`. Both response builders
// hold the `AppFailure` as they serialize, so each stashes `{ category, code }`
// for the operation's owner to read when it materializes the capability record.
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  setDependencyTimingSink,
  type DependencyKind,
  type DependencyTiming,
} from '@/lib/dependency-timing';
import type { AppFailure, FailureCategory } from '@/lib/failure';

/** The stable category and code of the failure one operation actually served. */
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

/**
 * Runs `work` inside a fresh correlation scope and returns its result. The scope owns one
 * correlation id and one dependency accumulator for the whole operation, and installs the
 * dependency-timing sink on first use.
 */
export function withCorrelationScope<T>(work: () => Promise<T>): Promise<T> {
  installDependencySink();
  return storage.run(
    { correlationId: crypto.randomUUID(), dependencies: {}, failure: null },
    work,
  );
}

/** The active scope's correlation id, or a fresh one when called outside any scope. */
export function currentCorrelationId(): string {
  return storage.getStore()?.correlationId ?? crypto.randomUUID();
}

/** The active scope's accumulated dependency durations, or an empty map outside one. */
export function currentDependencyTimings(): Partial<Record<DependencyKind, DependencyTiming>> {
  return storage.getStore()?.dependencies ?? {};
}

/**
 * Records the failure this operation served so its owner can recover the stable code the
 * response status alone cannot express. A no-op outside a scope.
 */
export function stashFailure(failure: AppFailure): void {
  const scope = storage.getStore();
  if (scope === undefined) return;
  scope.failure = { category: failure.category, code: failure.code };
}

/** The failure this operation served, or null when it succeeded or ran outside a scope. */
export function currentStashedFailure(): StashedFailure | null {
  return storage.getStore()?.failure ?? null;
}
