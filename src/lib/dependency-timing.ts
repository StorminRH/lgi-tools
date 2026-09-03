// deliberately import-free and free of `node:` builtins: the three seams that
// call it (`src/platform/esi/index.ts`, `src/lib/upstash.ts`, `src/db/index.ts`)
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
