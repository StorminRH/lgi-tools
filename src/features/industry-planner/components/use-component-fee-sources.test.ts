import { beforeEach, expect, test, vi } from 'vitest';
import { createResourceRead } from '@/lib/resource-read';
import type { JobRoute, PlanFacility, ProfilePlan } from '../profiles/profile-plan';
import type { BlueprintStructure, SystemJobCostIndex } from '../types';

const h = vi.hoisted(() => ({
  reads: [] as { read: (signal: AbortSignal) => Promise<unknown>; onData: (data: unknown) => void; enabled: boolean; refreshKey: number }[],
  apiFetch: vi.fn(),
}));
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', () => rt.react);
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));
vi.mock('@/lib/retry', async (load) => {
  const { readWithRetries } = await load<typeof import('@/lib/retry')>();
  return { readWithRetries: (read: () => Promise<unknown>, signal?: AbortSignal) => readWithRetries(read, signal, [0, 0]) };
});

vi.mock('@/lib/use-resource-read', () => ({
  useResourceRead: (read: (signal: AbortSignal) => Promise<unknown>, opts: {
    enabled: boolean; onData: (data: unknown) => void; refreshKey: number;
  }) => {
    h.reads.push({ read, ...opts });
  },
}));

import { useComponentFeeSources } from './use-component-fee-sources';

/** One render. State 0 holds the cost indices, which read 0 fetches. */
function feeSources(...args: Parameters<typeof useComponentFeeSources>) {
  h.reads = [];
  return rt.render(useComponentFeeSources, ...args);
}

const structure = { blueprintTypeId: 100, nodeActivityByBlueprint: { 100: 1, 110: 1, 120: 11, 130: 1 } } as unknown as BlueprintStructure;
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
const successfulRead = { key: '30000142,30004759', refreshKey: 0, bySystem: new Map(systems.map((s) => [s.systemId, s])) };

beforeEach(() => {
  rt.unmount();
  h.apiFetch.mockReset();
});

test('without a profile nothing is read, charged or marked failed', () => {
  expect(feeSources(structure, null, 0)).toEqual({ sources: null, failed: false, pending: false });
  expect(h.reads[0]!.enabled).toBe(false);
});

test("reads each job's system once, with the product's fallback for unplaced jobs", async () => {
  feeSources(structure, plan, 0);
  h.apiFetch.mockResolvedValue({ ok: true, data: { systems } });
  const signal = new AbortController().signal;
  expect(await h.reads[0]!.read(signal)).toEqual(successfulRead);
  expect(h.apiFetch.mock.calls[0]![1]).toMatchObject({ body: { systemIds: [30000142, 30004759] }, signal });
  expect(h.reads[0]!.enabled).toBe(true);
});

test('a blip the next attempt clears never shows as a failure', async () => {
  feeSources(structure, plan, 0);
  h.apiFetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, data: { systems } });
  h.reads[0]!.onData(await h.reads[0]!.read(new AbortController().signal));
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  const result = feeSources(structure, plan, 0);
  expect(result.failed).toBe(false);
  expect(result.sources!.costIndexOf(30000142, true)).toBe(0.02);
});

test.each(['response', 'network'])('%s failure shows after three attempts, clears on Retry, and the next read decides', async (failure) => {
  feeSources(structure, plan, 0);
  if (failure === 'response') h.apiFetch.mockResolvedValue({ ok: false });
  else h.apiFetch.mockRejectedValue(new Error('offline'));
  h.reads[0]!.onData(await h.reads[0]!.read(new AbortController().signal));
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
  let result = feeSources(structure, plan, 0);
  expect(result.failed).toBe(true);
  expect(result.pending).toBe(false);
  expect(result.sources!.costIndexOf(30000142, true)).toBeNull();
  result = feeSources(structure, plan, 1);
  expect(h.reads[0]!.refreshKey).toBe(1);
  expect(result.failed).toBe(false);
  expect(result.pending).toBe(true);
  h.apiFetch.mockReset();
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { systems } });
  h.reads[0]!.onData(await h.reads[0]!.read(new AbortController().signal));
  result = feeSources(structure, plan, 1);
  expect(result.failed).toBe(false);
  expect(result.sources!.costIndexOf(30000142, true)).toBe(0.02);
});

test('until read, every job is missing its index; once read it uses its own activity', () => {
  const pending = feeSources(structure, plan, 0);
  expect(pending.failed).toBe(false);
  expect(pending.pending).toBe(true);
  expect(pending.sources!.siteOf(120).systemId).toBe(30000142);
  expect(pending.sources!.costIndexOf(30000142, true)).toBeNull();
  rt.states[0] = successfulRead;
  const { sources, pending: stillPending } = feeSources(structure, plan, 0);
  expect(stillPending).toBe(false);
  expect(sources!.costIndexOf(30000142, true)).toBe(0.02);
  expect(sources!.costIndexOf(30004759, false)).toBe(0.05);
  expect(sources!.costIndexOf(30004759, true)).toBeNull();
});

test('other-system data and failures are ignored for the current profile', () => {
  rt.states[0] = { key: '30000142', bySystem: successfulRead.bySystem };
  expect(feeSources(structure, plan, 0).sources!.costIndexOf(30000142, true)).toBeNull();
  rt.states[0] = { key: '30000142', bySystem: null };
  expect(feeSources(structure, plan, 0).failed).toBe(false);
});

test('a profile with no known systems reads nothing and does not show an old failure', () => {
  rt.states[0] = { key: '30000142,30004759', bySystem: null };
  const nowhere = { top: route(null), routeOf: () => route(null) } as unknown as ProfilePlan;
  const result = feeSources(structure, nowhere, 0);
  expect(result.sources).not.toBeNull();
  expect(result.failed).toBe(false);
  expect(h.reads[0]!.enabled).toBe(false);
});

test.each([true, false])('a cancelled read cannot apply its late success=%s after a profile change', async (ok) => {
  feeSources(structure, plan, 0);
  let finish!: (result: unknown) => void;
  h.apiFetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const onData = vi.fn(h.reads[0]!.onData);
  const resource = createResourceRead({ read: h.reads[0]!.read, onData });
  const pending = resource.start();
  const signal = h.apiFetch.mock.calls[0]![1].signal as AbortSignal;
  resource.cancel();
  feeSources(structure, null, 0);
  finish(ok ? { ok: true, data: { systems } } : { ok: false });
  await pending;
  expect(signal.aborted).toBe(true);
  expect(onData).not.toHaveBeenCalled();
  expect(rt.states[0]).toBeNull();
});

