import { beforeEach, expect, test, vi } from 'vitest';
import type { JobRoute, PlanFacility, ProfilePlan } from '../profiles/profile-plan';
import type { BlueprintStructure, SystemJobCostIndex } from '../types';

const h = vi.hoisted(() => ({
  state: null as unknown,
  read: null as ((signal: AbortSignal) => Promise<unknown>) | null,
  enabled: false,
  apiFetch: vi.fn(),
}));

vi.mock('react', () => ({
  useState: () => [h.state, vi.fn()],
  useMemo: <T>(make: () => T) => make(),
  useCallback: <T>(fn: T) => fn,
}));
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));
vi.mock('../use-resource-read', () => ({
  useResourceRead: (read: (signal: AbortSignal) => Promise<unknown>, opts: { enabled: boolean }) => {
    h.read = read;
    h.enabled = opts.enabled;
  },
}));

import { useComponentFeeSources } from './use-component-fee-sources';

const structure = { nodeActivityByBlueprint: { 100: 1, 110: 1, 120: 11, 130: 1 } } as unknown as BlueprintStructure;

const at = (systemId: number | null): PlanFacility => ({
  key: `f${systemId}`,
  id: `f${systemId}`,
  name: 'Facility',
  kind: 'station',
  structure: null,
  systemId,
  security: null,
  categories: [],
});
const route = (facility: PlanFacility | null): JobRoute => ({ facility, characterId: null, bonus: null });
// The product and the plates in 1DQ1-A, the carbide in a refinery elsewhere, one job placed nowhere.
const ROUTES: Record<number, JobRoute> = {
  100: route(at(30004759)),
  110: route(at(30004759)),
  120: route(at(30000142)),
  130: route(null),
};
const plan = { top: ROUTES[100]!, routeOf: (bp: number) => ROUTES[bp]! } as unknown as ProfilePlan;

const read = (systems: SystemJobCostIndex[]) => ({
  key: '30000142,30004759',
  bySystem: new Map(systems.map((s) => [s.systemId, s])),
});

beforeEach(() => {
  h.state = null;
  h.read = null;
  h.enabled = false;
  h.apiFetch.mockReset();
});

test('without a profile nothing is read and no component job is charged', () => {
  expect(useComponentFeeSources(structure, null)).toBeNull();
  expect(h.enabled).toBe(false);
});

test("reads each job's system once, the product's standing in for a job placed nowhere", async () => {
  useComponentFeeSources(structure, plan);
  expect(h.enabled).toBe(true);
  h.apiFetch.mockResolvedValue({
    ok: true,
    data: { systems: [{ systemId: 30000142, manufacturing: 0.1, reaction: 0.02 }] },
  });
  const result = await h.read!(new AbortController().signal);
  expect(h.apiFetch.mock.calls[0]![1]).toMatchObject({ body: { systemIds: [30000142, 30004759] } });
  expect(result).toEqual(read([{ systemId: 30000142, manufacturing: 0.1, reaction: 0.02 }]));
});

test('a failed read leaves the indices unread', async () => {
  useComponentFeeSources(structure, plan);
  h.apiFetch.mockResolvedValue({ ok: false });
  expect(await h.read!(new AbortController().signal)).toBeNull();
});

test('until its systems are read every job is missing its index', () => {
  const sources = useComponentFeeSources(structure, plan)!;
  expect(sources.siteOf(120).systemId).toBe(30000142);
  expect(sources.costIndexOf(30000142, true)).toBeNull();
});

test('once read, each job takes its activity’s index for its system', () => {
  h.state = read([
    { systemId: 30000142, manufacturing: 0.1, reaction: 0.02 },
    { systemId: 30004759, manufacturing: 0.05, reaction: null },
  ]);
  const sources = useComponentFeeSources(structure, plan)!;
  expect(sources.costIndexOf(30000142, true)).toBe(0.02);
  expect(sources.costIndexOf(30004759, false)).toBe(0.05);
  expect(sources.costIndexOf(30004759, true)).toBeNull();
});

test('indices read for other systems are not taken for this plan', () => {
  h.state = { key: '30000142', bySystem: new Map([[30000142, { systemId: 30000142, manufacturing: 0.1, reaction: 0.02 }]]) };
  expect(useComponentFeeSources(structure, plan)!.costIndexOf(30000142, true)).toBeNull();
});

test('a profile that places no job anywhere reads nothing', () => {
  const nowhere = { top: route(null), routeOf: () => route(null) } as unknown as ProfilePlan;
  expect(useComponentFeeSources(structure, nowhere)).not.toBeNull();
  expect(h.enabled).toBe(false);
});
