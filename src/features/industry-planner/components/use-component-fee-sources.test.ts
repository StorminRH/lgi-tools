import { beforeEach, expect, test, vi } from 'vitest';
import { createResourceRead } from '../resource-read';
import type { JobRoute, PlanFacility, ProfilePlan } from '../profiles/profile-plan';
import type { BlueprintStructure, SystemJobCostIndex } from '../types';

const h = vi.hoisted(() => ({
  state: null as unknown,
  read: null as ((signal: AbortSignal) => Promise<unknown>) | null,
  onData: null as ((data: unknown) => void) | null,
  enabled: false,
  refreshKey: 0,
  apiFetch: vi.fn(),
}));

vi.mock('react', () => ({
  useState: () => [h.state, (data: unknown) => { h.state = data; }],
  useMemo: <T>(make: () => T) => make(),
  useCallback: <T>(fn: T) => fn,
}));
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));
vi.mock('../use-resource-read', () => ({
  useResourceRead: (read: (signal: AbortSignal) => Promise<unknown>, opts: {
    enabled: boolean; onData: (data: unknown) => void; refreshKey: number;
  }) => {
    h.read = read;
    h.onData = opts.onData;
    h.enabled = opts.enabled;
    h.refreshKey = opts.refreshKey;
  },
}));

import { useComponentFeeSources } from './use-component-fee-sources';

const structure = { nodeActivityByBlueprint: { 100: 1, 110: 1, 120: 11, 130: 1 } } as unknown as BlueprintStructure;
const at = (systemId: number | null): PlanFacility => ({
  key: `f${systemId}`, id: `f${systemId}`, name: 'Facility', kind: 'station', structure: null,
  systemId, security: null, categories: [],
});
const route = (facility: PlanFacility | null): JobRoute => ({ facility, characterId: null, bonus: null });
const ROUTES: Record<number, JobRoute> = {
  100: route(at(30004759)), 110: route(at(30004759)), 120: route(at(30000142)), 130: route(null),
};
const plan = { top: ROUTES[100]!, routeOf: (bp: number) => ROUTES[bp]! } as unknown as ProfilePlan;
const systems: SystemJobCostIndex[] = [
  { systemId: 30000142, manufacturing: 0.1, reaction: 0.02 },
  { systemId: 30004759, manufacturing: 0.05, reaction: null },
];
const successfulRead = { key: '30000142,30004759', bySystem: new Map(systems.map((s) => [s.systemId, s])) };

beforeEach(() => {
  h.state = null;
  h.read = null;
  h.onData = null;
  h.enabled = false;
  h.refreshKey = 0;
  h.apiFetch.mockReset();
});

test('without a profile nothing is read, charged or marked failed', () => {
  expect(useComponentFeeSources(structure, null, 0)).toEqual({ sources: null, failed: false });
  expect(h.enabled).toBe(false);
});

test("reads each job's system once, with the product's fallback for unplaced jobs", async () => {
  useComponentFeeSources(structure, plan, 0);
  h.apiFetch.mockResolvedValue({ ok: true, data: { systems } });
  const signal = new AbortController().signal;
  expect(await h.read!(signal)).toEqual(successfulRead);
  expect(h.apiFetch.mock.calls[0]![1]).toMatchObject({ body: { systemIds: [30000142, 30004759] }, signal });
  expect(h.enabled).toBe(true);
});

test.each(['response', 'network'])('%s failure persists through retry until the current read succeeds', async (failure) => {
  useComponentFeeSources(structure, plan, 0);
  if (failure === 'response') h.apiFetch.mockResolvedValueOnce({ ok: false });
  else h.apiFetch.mockRejectedValueOnce(new Error('offline'));
  h.onData!(await h.read!(new AbortController().signal));
  let result = useComponentFeeSources(structure, plan, 0);
  expect(result.failed).toBe(true);
  expect(result.sources!.costIndexOf(30000142, true)).toBeNull();
  result = useComponentFeeSources(structure, plan, 1);
  expect(h.refreshKey).toBe(1);
  expect(result.failed).toBe(true);
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { systems } });
  h.onData!(await h.read!(new AbortController().signal));
  result = useComponentFeeSources(structure, plan, 1);
  expect(result.failed).toBe(false);
  expect(result.sources!.costIndexOf(30000142, true)).toBe(0.02);
});

test('until read, every job is missing its index; once read it uses its own activity', () => {
  const pending = useComponentFeeSources(structure, plan, 0);
  expect(pending.failed).toBe(false);
  expect(pending.sources!.siteOf(120).systemId).toBe(30000142);
  expect(pending.sources!.costIndexOf(30000142, true)).toBeNull();
  h.state = successfulRead;
  const { sources } = useComponentFeeSources(structure, plan, 0);
  expect(sources!.costIndexOf(30000142, true)).toBe(0.02);
  expect(sources!.costIndexOf(30004759, false)).toBe(0.05);
  expect(sources!.costIndexOf(30004759, true)).toBeNull();
});

test('other-system data and failures are ignored for the current profile', () => {
  h.state = { key: '30000142', bySystem: successfulRead.bySystem };
  expect(useComponentFeeSources(structure, plan, 0).sources!.costIndexOf(30000142, true)).toBeNull();
  h.state = { key: '30000142', bySystem: null };
  expect(useComponentFeeSources(structure, plan, 0).failed).toBe(false);
});

test('a profile with no known systems reads nothing and does not show an old failure', () => {
  h.state = { key: '30000142,30004759', bySystem: null };
  const nowhere = { top: route(null), routeOf: () => route(null) } as unknown as ProfilePlan;
  const result = useComponentFeeSources(structure, nowhere, 0);
  expect(result.sources).not.toBeNull();
  expect(result.failed).toBe(false);
  expect(h.enabled).toBe(false);
});

test.each([true, false])('a cancelled read cannot apply its late success=%s after a profile change', async (ok) => {
  useComponentFeeSources(structure, plan, 0);
  let finish!: (result: unknown) => void;
  h.apiFetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const onData = vi.fn(h.onData!);
  const resource = createResourceRead({ read: h.read!, onData });
  const pending = resource.start();
  const signal = h.apiFetch.mock.calls[0]![1].signal as AbortSignal;
  resource.cancel();
  useComponentFeeSources(structure, null, 0);
  finish(ok ? { ok: true, data: { systems } } : { ok: false });
  await pending;
  expect(signal.aborted).toBe(true);
  expect(onData).not.toHaveBeenCalled();
  expect(h.state).toBeNull();
});
