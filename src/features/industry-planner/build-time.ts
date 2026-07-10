import { formatRemaining } from '@/lib/format/time';

// Manufacturing build time for the cockpit (3.7.5.6 applies Time Efficiency). CCP's
// `time` is the base seconds for one run at TE0 with NO character skills,
// structure/rig time bonuses, or implants; TE reduces it by `TE%` (research level ×
// 2%, capped at 20%). Structure time bonuses (3.7.9.1.3) and the selected build
// character's skills (3.7.19.1, skill-time.ts) enter as per-node factor closures;
// implants stay unapplied.
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

// One job in the "total job time" calculation: a buildable, its TE-adjusted per-run
// time, the batched run count, and the product (perRun × runs). Seconds; the UI
// formats them. The whole breakdown's `totalSeconds` sums to the Total job time.
export interface BuildTimeLine {
  typeId: number;
  name: string;
  perRunSeconds: number;
  runs: number;
  totalSeconds: number;
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
  // The per-job calculation that sums to `totalProduction` — the final product first,
  // then each component/reaction by descending total. Shown in the tile's hover.
  breakdown: BuildTimeLine[];
}

// Compute the build-time figures + the per-job breakdown. `builds` is the ME-aware
// batch ledger's per-node entries (keyed by product typeId, each carrying its
// whole-run count + producing blueprint); the top product is NOT among them, so it is
// added once from `topJobSeconds`. `teOf` returns a blueprint's effective TE (owned or
// overridden), or undefined ⇒ TE0; `nameOf` labels each line by product typeId.
export function computeBuildTimes(args: {
  topBlueprintTypeId: number;
  topProductTypeId: number;
  topJobSeconds: number | null;
  nodeJobSeconds: Record<number, number>;
  runs: number;
  builds: Map<number, { runs: number; blueprintTypeId: number }>;
  teOf: (blueprintTypeId: number) => number | undefined;
  nameOf: (typeId: number) => string;
  // Optional per-node structure TIME factor (3.7.9.1.3): the (1 − structureTe/100)
  // a selected build structure applies to a job by its activity (an Engineering
  // Complex's time bonus on manufacturing jobs, a Refinery's on reactions).
  // Omitted / returning 1 ⇒ the build-time figures are byte-identical to pre-3.7.9.
  structureTeFactorOf?: (blueprintTypeId: number) => number;
  // The selected build character's per-node skills TIME factor (3.7.19.1 — the
  // lever the ACCOUNT.8 seam was reserved for; skill-time.ts builds it from the
  // character's trained levels). Omitted / returning 1 ⇒ byte-identical to the
  // no-character baseline (test-pinned).
  skillTimeFactorOf?: (blueprintTypeId: number) => number;
}): BuildTimes {
  const { topBlueprintTypeId, topProductTypeId, topJobSeconds, nodeJobSeconds, runs, builds, teOf, nameOf } =
    args;
  const structureTeOf = args.structureTeFactorOf ?? (() => 1);
  const skillTimeOf = args.skillTimeFactorOf ?? (() => 1);
  const wholeRuns = Math.max(0, Math.floor(runs));
  const topTe = teOf(topBlueprintTypeId) ?? 0;
  const topPerRun =
    topJobSeconds === null || topJobSeconds <= 0
      ? 0
      : topJobSeconds * teFactor(topTe) * structureTeOf(topBlueprintTypeId) * skillTimeOf(topBlueprintTypeId);
  const topTotal = topPerRun * wholeRuns;

  // Each intermediate's TE-adjusted job time, biggest contributor first. A node with
  // no honest base time (a degenerate self-recipe) contributes nothing.
  const components: BuildTimeLine[] = [];
  for (const [typeId, entry] of builds) {
    const base = nodeJobSeconds[entry.blueprintTypeId] ?? 0;
    if (base <= 0) continue;
    const perRunSeconds =
      base *
      teFactor(teOf(entry.blueprintTypeId) ?? 0) *
      structureTeOf(entry.blueprintTypeId) *
      skillTimeOf(entry.blueprintTypeId);
    const totalSeconds = perRunSeconds * entry.runs;
    if (totalSeconds <= 0) continue;
    components.push({ typeId, name: nameOf(typeId), perRunSeconds, runs: entry.runs, totalSeconds });
  }
  components.sort((a, b) => b.totalSeconds - a.totalSeconds);

  // The final product leads the breakdown; the components follow by descending total.
  const breakdown: BuildTimeLine[] = [];
  if (topTotal > 0) {
    breakdown.push({
      typeId: topProductTypeId,
      name: nameOf(topProductTypeId),
      perRunSeconds: topPerRun,
      runs: wholeRuns,
      totalSeconds: topTotal,
    });
  }
  breakdown.push(...components);

  const totalSeconds = breakdown.reduce((sum, line) => sum + line.totalSeconds, 0);

  return {
    topJob: topTotal > 0 ? formatBuildDuration(topTotal) : null,
    totalProduction: totalSeconds > 0 ? formatBuildDuration(totalSeconds) : null,
    topTe,
    breakdown,
  };
}
