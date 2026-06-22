import { formatRemaining } from '@/lib/format/time';
import type { BuildTimeView } from './types';

// Build-time for the cockpit's Build-time tile — the FINAL assembly job only.
// CCP's `time` is the base seconds for one run at ME0/TE0 with NO character
// skills, structure/rig time bonuses, or implants; a maxed, rigged builder
// finishes materially faster, so the tile's hover says so.
//
// The whole-tree "total build time" (every component + reaction job) is
// deliberately NOT shown: it isn't a simple sum of intermediate job times — job
// slots, parallelism, and build-vs-buy all change the answer (building one Ishtar
// from an empty hangar would otherwise read as ~27 days). Deferred to the backlog.

// Compact largest-two-units duration for a build job, reusing the app's
// remaining-time idiom (seconds → ms). Sub-minute floors to "<1m".
export function formatBuildDuration(seconds: number): string {
  return formatRemaining(Math.round(seconds) * 1000);
}

// The tile's pre-formatted view, or null when the product has no honest base time
// (a degenerate blueprint, or zero runs). `seconds` is the top blueprint's per-run
// base time; the final job runs `runs` of it back-to-back.
export function toBuildTimeView(seconds: number | null, runs: number): BuildTimeView | null {
  if (seconds === null || seconds <= 0) return null;
  const total = seconds * Math.max(0, Math.floor(runs));
  if (total <= 0) return null;
  return { topJob: formatBuildDuration(total) };
}
