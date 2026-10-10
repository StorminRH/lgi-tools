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

/** Time `work` as one call of `kind`, whether it resolves or throws. */
export async function timeDependency<T>(kind: DependencyKind, work: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await work();
  } finally {
    addDependencyTiming(kind, performance.now() - startedAt);
  }
}
