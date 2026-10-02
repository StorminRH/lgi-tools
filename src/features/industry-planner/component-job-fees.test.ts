import { describe, expect, it } from 'vitest';
import type { FeeJob } from './build-batch';
import { computeComponentJobFees, profileFeeSiteOf, type ComponentFeeSources, type JobFeeSite } from './component-job-fees';
import type { JobRoute, PlanFacility } from './profiles/profile-plan';
import type { AvailableStructure } from './types';

const PLATES: FeeJob = {
  typeId: 10,
  blueprintTypeId: 110,
  runs: 2,
  baseMaterials: [
    { typeId: 30, quantity: 10 },
    { typeId: 40, quantity: 14 },
  ],
};
const CARBIDE: FeeJob = { typeId: 20, blueprintTypeId: 120, runs: 3, baseMaterials: [{ typeId: 50, quantity: 300 }] };
const IDLE: FeeJob = { typeId: 60, blueprintTypeId: 160, runs: 0, baseMaterials: [{ typeId: 30, quantity: 0 }] };

const SITES: Record<number, JobFeeSite> = {
  110: { systemId: 1, facilityTaxPct: 1, costBonusPct: 4 },
  120: { systemId: 2, facilityTaxPct: null, costBonusPct: 0 },
  160: { systemId: 1, facilityTaxPct: null, costBonusPct: 0 },
};
const INDICES: Record<number, { manufacturing: number | null; reaction: number | null }> = {
  1: { manufacturing: 0.05, reaction: 0.9 },
  2: { manufacturing: 0.9, reaction: 0.02 },
};
const sources = (overrides: Partial<ComponentFeeSources> = {}): ComponentFeeSources => ({
  activityOf: (bp) => (bp === 120 ? 11 : 1),
  siteOf: (bp) => SITES[bp]!,
  costIndexOf: (systemId, reaction) => INDICES[systemId]?.[reaction ? 'reaction' : 'manufacturing'] ?? null,
  adjustedPriceOf: (typeId) => ({ 30: 100, 40: 50, 50: 2 })[typeId] ?? null,
  ...overrides,
});

describe('computeComponentJobFees', () => {
  it('charges each job its own system index, facility tax and cost bonus, on its unresearched inputs', () => {
    const { jobs, total } = computeComponentJobFees([PLATES, CARBIDE], sources());
    // Plates: EIV 10×100 + 14×50 = 1,700, at 5% less a 4% bonus, 1% tax, 4% SCC.
    expect(jobs[0]).toMatchObject({ typeId: 10, reaction: false, runs: 2, systemId: 1, systemCostIndex: 0.05, facilityTaxRate: 0.01 });
    expect(jobs[0]!.fee.estimatedItemValue).toBe(1_700);
    expect(jobs[0]!.fee.jobGrossCost).toBeCloseTo(81.6, 9);
    expect(jobs[0]!.fee.facilityTax).toBeCloseTo(17, 9);
    expect(jobs[0]!.fee.sccSurcharge).toBeCloseTo(68, 9);
    expect(jobs[0]!.fee.total).toBeCloseTo(166.6, 9);
    // Carbide: a reaction, so the reaction index; EIV 300×2 = 600, at 2%, the default 0.25% tax, 4% SCC.
    expect(jobs[1]).toMatchObject({ typeId: 20, reaction: true, systemCostIndex: 0.02, facilityTaxRate: 0.0025 });
    expect(jobs[1]!.fee.total).toBeCloseTo(12 + 1.5 + 24, 9);
    expect(total).toBeCloseTo(166.6 + 37.5, 9);
  });

  it('the total is the sum of the jobs it lists, and a job with no runs is not one', () => {
    const { jobs, total } = computeComponentJobFees([PLATES, IDLE, CARBIDE], sources());
    expect(jobs.map((j) => j.typeId)).toEqual([10, 20]);
    expect(total).toBeCloseTo(jobs.reduce((sum, j) => sum + j.fee.total!, 0), 9);
  });

  it('a job in a system with no index keeps its tax and surcharge but leaves the total open', () => {
    const { jobs, total } = computeComponentJobFees(
      [PLATES, CARBIDE],
      sources({ siteOf: (bp) => (bp === 120 ? { ...SITES[120]!, systemId: 3 } : SITES[bp]!) }),
    );
    expect(jobs[1]!.systemCostIndex).toBeNull();
    expect(jobs[1]!.fee.missingSystemCostIndex).toBe(true);
    expect(jobs[1]!.fee.facilityTax).toBeCloseTo(1.5, 9);
    expect(jobs[1]!.fee.total).toBeNull();
    expect(total).toBeNull();
  });

  it('a job with nowhere to run has no index', () => {
    const { jobs, total } = computeComponentJobFees(
      [PLATES],
      sources({ siteOf: () => ({ systemId: null, facilityTaxPct: null, costBonusPct: 0 }) }),
    );
    expect(jobs[0]!.systemCostIndex).toBeNull();
    expect(total).toBeNull();
  });

  it('an input with no adjusted price adds nothing to the value and is named', () => {
    const { jobs } = computeComponentJobFees([PLATES], sources({ adjustedPriceOf: (id) => (id === 30 ? 100 : null) }));
    expect(jobs[0]!.fee.estimatedItemValue).toBe(1_000);
    expect(jobs[0]!.fee.missingAdjustedPriceTypeIds).toEqual([40]);
  });

  it('nothing built, nothing charged', () => {
    expect(computeComponentJobFees([], sources())).toEqual({ jobs: [], total: 0 });
  });
});

const facility = (systemId: number | null, structure: Partial<AvailableStructure> | null): PlanFacility => ({
  key: `f${systemId}`,
  id: `f${systemId}`,
  name: 'Facility',
  kind: structure ? 'structure' : 'station',
  structure: structure as AvailableStructure | null,
  systemId,
  security: null,
  categories: [],
});
const route = (place: PlanFacility | null, costBonus = 0): JobRoute => ({
  facility: place,
  characterId: null,
  bonus: place ? { me: 0, te: 0, costBonus } : null,
});

describe('profileFeeSiteOf', () => {
  const sotiyo = route(facility(30004759, { taxPct: 2 }), 5);
  const station = route(facility(30000142, null));
  const routes: Record<number, JobRoute> = {
    110: sotiyo,
    120: station,
    130: route(null),
    140: route(facility(null, { taxPct: 1 }), 3),
  };
  const siteOf = profileFeeSiteOf({ top: station, routeOf: (bp) => routes[bp]! });

  it("a job takes its facility's system, tax and cost bonus", () => {
    expect(siteOf(110)).toEqual({ systemId: 30004759, facilityTaxPct: 2, costBonusPct: 5 });
  });

  it('an NPC station takes the default tax', () => {
    expect(siteOf(120)).toEqual({ systemId: 30000142, facilityTaxPct: null, costBonusPct: 0 });
  });

  it("a job no facility takes runs where the product does, at the default tax and no bonus", () => {
    expect(siteOf(130)).toEqual({ systemId: 30000142, facilityTaxPct: null, costBonusPct: 0 });
  });

  it("a facility with no known system still charges its own tax and bonus in the product's system", () => {
    expect(siteOf(140)).toEqual({ systemId: 30000142, facilityTaxPct: 1, costBonusPct: 3 });
  });

  it('with the product placed nowhere, a job no facility takes has no system', () => {
    expect(profileFeeSiteOf({ top: route(null), routeOf: () => route(null) })(130).systemId).toBeNull();
  });
});
