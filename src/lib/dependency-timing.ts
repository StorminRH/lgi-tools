export const DEPENDENCY_KINDS = ['neon', 'esi', 'redis', 'convex', 'sso', 'fuzzwork'] as const;

export type DependencyKind = (typeof DEPENDENCY_KINDS)[number];

export interface DependencyTiming {
  /** Summed duration of every call; concurrent calls each count in full. */
  ms: number;
  calls: number;
  /** Elapsed time with at least one call of this kind in flight. */
  wallMs?: number;
  /** Calls answered with a 4xx other than 420/429; only kinds that report a status record it. */
  status4xx?: number;
}

/** What a finished call reports beyond its duration. */
export interface DependencyCall {
  status?: number;
}

export type DependencyTimingSink = (kind: DependencyKind, ms: number, call?: DependencyCall) => void;

let sink: DependencyTimingSink | null = null;

export function setDependencyTimingSink(next: DependencyTimingSink): void {
  sink = next;
}

/** Report a call that just finished after `ms` milliseconds. */
export function addDependencyTiming(kind: DependencyKind, ms: number, call?: DependencyCall): void {
  sink?.(kind, ms, call);
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
