import { formatRemaining } from '@/lib/format/time';

// Manufacturing build time for the cockpit (3.7.5.6 applies Time Efficiency). CCP's
// `time` is the base seconds for one run at TE0 with NO character skills,
// structure/rig time bonuses, or implants; TE reduces it by `TE%` (research level ×
// 2%, capped at 20%). Skills/structure stay unapplied (the tile's hover says so), so
// a maxed, rigged builder still finishes faster than shown.
//
// Two figures: the FINAL assembly job ("Build time") and the WHOLE-TREE sum across
// every component + reaction job ("Total job time"). The total is a sequential sum
// (one job slot, no parallelism) — building one Ishtar from an empty hangar reads as
// days; the tile's hover says so.

// Time-efficiency multiplier: TE% (0–20) reduces job time. 0 ⇒ 1 (unchanged), the
// byte-identical anchor for the pre-TE Build-time figure.
export function teFactor(te: number): number {
  return te <= 0 ? 1 : 1 - te / 100;
}

// Compact largest-two-units duration for a build job, reusing the app's
// remaining-time idiom (seconds → ms). Sub-minute floors to "<1m".
export function formatBuildDuration(seconds: number): string {
  return formatRemaining(Math.round(seconds) * 1000);
}

export interface BuildTimes {
  // The final assembly job, runs-scaled + TE-adjusted, or null (degenerate / 0 runs).
  topJob: string | null;
  // Every job in the tree (final + components + reactions), each TE-adjusted and
  // scaled by its batched run count, summed sequentially. Null only when nothing
  // has an honest base time.
  totalProduction: string | null;
  // The effective TE applied to the top blueprint (for the tile's hover).
  topTe: number;
}

// Compute the two build-time figures. `builds` is the ME-aware batch ledger's
// per-node entries (each carrying its whole-run count + producing blueprint); the
// top product is NOT among them, so it is added once from `topJobSeconds`. `teOf`
// returns a blueprint's effective TE (owned or overridden), or undefined ⇒ TE0.
export function computeBuildTimes(args: {
  topBlueprintTypeId: number;
  topJobSeconds: number | null;
  nodeJobSeconds: Record<number, number>;
  runs: number;
  builds: Map<number, { runs: number; blueprintTypeId: number }>;
  teOf: (blueprintTypeId: number) => number | undefined;
}): BuildTimes {
  const { topBlueprintTypeId, topJobSeconds, nodeJobSeconds, runs, builds, teOf } = args;
  const wholeRuns = Math.max(0, Math.floor(runs));
  const topTe = teOf(topBlueprintTypeId) ?? 0;
  const topSeconds =
    topJobSeconds === null || topJobSeconds <= 0 ? 0 : topJobSeconds * teFactor(topTe) * wholeRuns;

  // Sum every intermediate's TE-adjusted job time onto the final job. A node with no
  // honest base time (a degenerate self-recipe) contributes nothing.
  let totalSeconds = topSeconds;
  for (const entry of builds.values()) {
    const base = nodeJobSeconds[entry.blueprintTypeId] ?? 0;
    if (base <= 0) continue;
    totalSeconds += entry.runs * base * teFactor(teOf(entry.blueprintTypeId) ?? 0);
  }

  return {
    topJob: topSeconds > 0 ? formatBuildDuration(topSeconds) : null,
    totalProduction: totalSeconds > 0 ? formatBuildDuration(totalSeconds) : null,
    topTe,
  };
}
