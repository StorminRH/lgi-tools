// The measurement-point half of per-operation dependency timing. It is
// deliberately import-free and free of `node:` builtins: the three seams that
// call it (`src/platform/esi/index.ts`, `src/lib/upstash.ts`, `src/db/index.ts`)
// sit in zones Fallow restricts to `lib`/`config`, and the first two are inside
// the Convex production bundle, where a `node:async_hooks` import would break
// the post-merge Convex push without ever failing `pnpm verify` or CI.
//
// The accumulating half lives in `src/transport/correlation.ts`, which installs
// itself here as a sink. Nothing installs a sink in the Convex isolate, so every
// call below stays a no-op there.

/** Dependency kinds whose per-operation durations are accumulated. */
export type DependencyKind = 'neon' | 'esi' | 'redis';

/** One dependency's accumulated cost inside one operation. */
export interface DependencyTiming {
  ms: number;
  calls: number;
}

/** Receives each measured dependency call on behalf of the active operation. */
export type DependencyTimingSink = (kind: DependencyKind, ms: number) => void;

let sink: DependencyTimingSink | null = null;

/** Installs the process's dependency-timing sink. Idempotent; the last installer wins. */
export function setDependencyTimingSink(next: DependencyTimingSink): void {
  sink = next;
}

/**
 * Records one dependency call's elapsed milliseconds. A no-op until a host installs a sink, so
 * this module stays import-free and safe in the Convex isolate.
 */
export function addDependencyTiming(kind: DependencyKind, ms: number): void {
  sink?.(kind, ms);
}
