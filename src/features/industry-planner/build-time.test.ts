import { describe, expect, it } from 'vitest';
import { computeBuildTimes, formatBuildDuration, teFactor } from './build-time';

const noTe = () => undefined;
const ledger = (entries: [number, { runs: number; blueprintTypeId: number }][]) => new Map(entries);

describe('teFactor', () => {
  it('is 1 at TE0 (the byte-identical anchor) and scales down with TE', () => {
    expect(teFactor(0)).toBe(1);
    expect(teFactor(-5)).toBe(1);
    expect(teFactor(20)).toBeCloseTo(0.8);
    expect(teFactor(10)).toBeCloseTo(0.9);
  });
});

describe('formatBuildDuration', () => {
  it('formats seconds as the largest two units', () => {
    expect(formatBuildDuration(0)).toBe('<1m');
    expect(formatBuildDuration(6000)).toBe('1h 40m');
    expect(formatBuildDuration(18_000)).toBe('5h');
    expect(formatBuildDuration(240_000)).toBe('2d 18h');
    expect(formatBuildDuration(9_000_000)).toBe('104d 4h');
  });
});

describe('computeBuildTimes', () => {
  const base = {
    topBlueprintTypeId: 1,
    topProductTypeId: 10,
    nodeJobSeconds: {} as Record<number, number>,
    builds: ledger([]),
    teOf: noTe,
    nameOf: (id: number) => `t${id}`,
  };

  it('topJob is byte-identical to the pre-TE final-job figure at TE0', () => {
    expect(computeBuildTimes({ ...base, topJobSeconds: 240_000, runs: 1 }).topJob).toBe('2d 18h');
    expect(computeBuildTimes({ ...base, topJobSeconds: 6_000, runs: 3 }).topJob).toBe('5h');

    expect(computeBuildTimes({ ...base, topJobSeconds: 6_000, runs: 2.9 }).topJob).toBe('3h 20m');
  });

  it('topJob is null for a degenerate / zero-run top job', () => {
    expect(computeBuildTimes({ ...base, topJobSeconds: 6_000, runs: 0 }).topJob).toBeNull();
    expect(computeBuildTimes({ ...base, topJobSeconds: null, runs: 1 }).topJob).toBeNull();
    expect(computeBuildTimes({ ...base, topJobSeconds: 0, runs: 1 }).topJob).toBeNull();
  });

  it('applies the top blueprint TE to the final-job figure and reports topTe', () => {
    const r = computeBuildTimes({
      ...base,
      topJobSeconds: 18_000,
      runs: 1,
      teOf: (bp) => (bp === 1 ? 20 : undefined),
    });
    expect(r.topJob).toBe('4h');
    expect(r.topTe).toBe(20);
  });

  it('sums every intermediate onto the final job, counting the top exactly once', () => {

    const r = computeBuildTimes({
      ...base,
      topJobSeconds: 18_000,
      nodeJobSeconds: { 5: 18_000 },
      runs: 1,
      builds: ledger([[200, { runs: 1, blueprintTypeId: 5 }]]),
    });
    expect(r.topJob).toBe('5h');
    expect(r.totalProduction).toBe('10h');
  });

  it('counts a reaction (TE0) intermediate at full time', () => {
    const r = computeBuildTimes({
      ...base,
      topJobSeconds: 18_000,
      nodeJobSeconds: { 5: 18_000 },
      runs: 1,
      builds: ledger([[200, { runs: 1, blueprintTypeId: 5 }]]),
      teOf: (bp) => (bp === 5 ? 0 : undefined),
    });
    expect(r.totalProduction).toBe('10h');
  });

  it('applies per-node TE to an intermediate and multiplies by its batched runs', () => {
    const r = computeBuildTimes({
      ...base,
      topJobSeconds: 0,
      nodeJobSeconds: { 5: 18_000 },
      runs: 1,
      builds: ledger([[200, { runs: 2, blueprintTypeId: 5 }]]),
      teOf: (bp) => (bp === 5 ? 20 : undefined),
    });

    expect(r.totalProduction).toBe('8h');
    expect(r.topJob).toBeNull();
  });

  it('applies the structure TE factor to the top job and intermediates (3.7.9.1.3)', () => {
    const r = computeBuildTimes({
      ...base,
      topJobSeconds: 18_000,
      nodeJobSeconds: { 5: 18_000 },
      runs: 1,
      builds: ledger([[200, { runs: 1, blueprintTypeId: 5 }]]),
      structureTeFactorOf: () => 0.9,
    });

    expect(r.topJob).toBe('4h 30m');
    expect(r.totalProduction).toBe('9h');
  });

  it('build-time is byte-identical when the structure TE factor is 1', () => {
    const args = {
      ...base,
      topJobSeconds: 18_000,
      nodeJobSeconds: { 5: 18_000 },
      runs: 1,
      builds: ledger([[200, { runs: 1, blueprintTypeId: 5 }]]),
    };
    const withFactor = computeBuildTimes({ ...args, structureTeFactorOf: () => 1 });
    const without = computeBuildTimes(args);
    expect(withFactor.topJob).toBe(without.topJob);
    expect(withFactor.totalProduction).toBe(without.totalProduction);
  });

  it('is byte-identical when the skill time factor is omitted or 1 — the unset build-character anchor', () => {

    const args = {
      ...base,
      topJobSeconds: 18_000,
      nodeJobSeconds: { 5: 18_000 },
      runs: 2,
      builds: ledger([[200, { runs: 3, blueprintTypeId: 5 }]]),
      teOf: (bp: number) => (bp === 1 ? 10 : undefined),
      structureTeFactorOf: () => 0.9,
    };
    const omitted = computeBuildTimes(args);
    const identity = computeBuildTimes({ ...args, skillTimeFactorOf: () => 1 });
    expect(identity).toEqual(omitted);

    expect(omitted.topJob).toBe('8h 6m');
    expect(omitted.totalProduction).toBe('21h 36m');
  });

  it('applies the build-character skill time factor to the top job and intermediates (hand-computed anchor)', () => {

    const skillsOnly = computeBuildTimes({
      ...base,
      topJobSeconds: 18_000,
      runs: 1,
      skillTimeFactorOf: () => 0.8,
    });
    expect(skillsOnly.topJob).toBe('4h');

    const r = computeBuildTimes({
      ...base,
      topJobSeconds: 18_000,
      nodeJobSeconds: { 5: 18_000 },
      runs: 1,
      builds: ledger([[200, { runs: 2, blueprintTypeId: 5 }]]),
      teOf: (bp: number) => (bp === 1 ? 10 : undefined),
      structureTeFactorOf: () => 0.9,
      skillTimeFactorOf: (bp: number) => (bp === 1 ? 0.8 * 0.85 * 0.95 : 0.8),
    });
    const top = r.breakdown[0]!;
    expect(top.perRunSeconds).toBeCloseTo(9_418.68, 6);

    const node = r.breakdown[1]!;
    expect(node.perRunSeconds).toBeCloseTo(12_960, 6);
    expect(node.totalSeconds).toBeCloseTo(25_920, 6);

    expect(r.topJob).toBe('2h 36m');
  });

  it('skips a degenerate intermediate with no base time without producing NaN', () => {
    const r = computeBuildTimes({
      ...base,
      topJobSeconds: 18_000,
      nodeJobSeconds: {},
      runs: 1,
      builds: ledger([[200, { runs: 5, blueprintTypeId: 7 }]]),
    });
    expect(r.totalProduction).toBe('5h');
  });

  it('totalProduction is null when nothing has an honest base time', () => {
    const r = computeBuildTimes({ ...base, topJobSeconds: null, runs: 1 });
    expect(r.totalProduction).toBeNull();
  });

  it('breaks the total down per job — product first, then components by descending total — and the lines sum to the total', () => {
    const r = computeBuildTimes({
      ...base,
      topProductTypeId: 10,
      topJobSeconds: 18_000,
      nodeJobSeconds: { 5: 3_600, 6: 7_200 },
      runs: 1,
      builds: ledger([
        [500, { runs: 2, blueprintTypeId: 5 }],
        [600, { runs: 3, blueprintTypeId: 6 }],
      ]),
      nameOf: (id) => ({ 10: 'Product', 500: 'Small', 600: 'Big' })[id] ?? `t${id}`,
    });
    expect(r.breakdown.map((l) => [l.name, l.perRunSeconds, l.runs, l.totalSeconds])).toEqual([
      ['Product', 18_000, 1, 18_000],
      ['Big', 7_200, 3, 21_600],
      ['Small', 3_600, 2, 7_200],
    ]);
    const sum = r.breakdown.reduce((s, l) => s + l.totalSeconds, 0);
    expect(sum).toBe(18_000 + 21_600 + 7_200);
    expect(r.totalProduction).toBe(formatBuildDuration(sum));
  });
});
