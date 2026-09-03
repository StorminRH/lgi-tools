import { formatRemaining } from '@/lib/format/time';

export function teFactor(te: number): number {
  return te <= 0 ? 1 : 1 - te / 100;
}

export function formatBuildDuration(seconds: number): string {
  return formatRemaining(Math.round(seconds) * 1000);
}

export interface BuildTimeLine {
  typeId: number;
  name: string;
  perRunSeconds: number;
  runs: number;
  totalSeconds: number;
}

export interface BuildTimes {

  topJob: string | null;

  totalProduction: string | null;

  topTe: number;

  breakdown: BuildTimeLine[];
}

export function computeBuildTimes(args: {
  topBlueprintTypeId: number;
  topProductTypeId: number;
  topJobSeconds: number | null;
  nodeJobSeconds: Record<number, number>;
  runs: number;
  builds: Map<number, { runs: number; blueprintTypeId: number }>;
  teOf: (blueprintTypeId: number) => number | undefined;
  nameOf: (typeId: number) => string;

  structureTeFactorOf?: (blueprintTypeId: number) => number;

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
