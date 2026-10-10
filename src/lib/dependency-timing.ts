export type DependencyKind = 'neon' | 'esi' | 'redis';

export interface DependencyTiming {
  ms: number;
  calls: number;
}

export type DependencyTimingSink = (kind: DependencyKind, ms: number) => void;

let sink: DependencyTimingSink | null = null;

export function setDependencyTimingSink(next: DependencyTimingSink): void {
  sink = next;
}

export function addDependencyTiming(kind: DependencyKind, ms: number): void {
  sink?.(kind, ms);
}

export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * Starts a monotonic `performance.now()` clock for one dependency call. Calling the returned
 * `stop` records the elapsed milliseconds against `kind`; it ignores its arguments, so it can be
 * passed as both handlers of a `then` to record a settlement either way.
 */
export function startDependencyTimer(kind: DependencyKind): () => void {
  const startedAt = performance.now();
  return () => {
    addDependencyTiming(kind, performance.now() - startedAt);
  };
}

/** Times one dependency call, recording it whether `work` resolves or rejects. */
export async function timeDependency<T>(
  kind: DependencyKind,
  work: () => Promise<T>,
): Promise<T> {
  const stop = startDependencyTimer(kind);
  try {
    return await work();
  } finally {
    stop();
  }
}
