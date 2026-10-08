import { beforeEach, expect, test, vi } from 'vitest';
import type { BuildLocationData, BlueprintStructure } from '../types';
import type { ReactionLocationSnapshot } from '../selection-policy';
import { MANUFACTURING_ACTIVITY, REACTION_ACTIVITY } from '../structure-bonus';

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  apiFetch: vi.fn(),
  reads: [] as { read: (signal: AbortSignal) => Promise<unknown>; enabled: boolean; refreshKey?: number }[],
}));
vi.mock('react', () => ({
  useState: <T>(initial: T) => {
    const index = h.cursor++;
    if (h.states.length <= index) h.states[index] = initial;
    return [h.states[index], (next: T | ((previous: T) => T)) => {
      h.states[index] = typeof next === 'function' ? (next as (previous: T) => T)(h.states[index] as T) : next;
    }];
  },
  useMemo: <T>(make: () => T) => make(),
  useCallback: <T>(callback: T) => callback,
}));
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));
vi.mock('../read-with-retries', async (load) => {
  const { readWithRetries } = await load<typeof import('../read-with-retries')>();
  return { readWithRetries: (read: () => Promise<unknown>, signal?: AbortSignal) => readWithRetries(read, signal, [0, 0]) };
});

vi.mock('../use-resource-read', () => ({
  useResourceRead: (read: (signal: AbortSignal) => Promise<unknown>, options: { enabled: boolean; refreshKey?: number }) => {
    h.reads.push({ read, ...options });
  },
}));

import { usePlannerLocationWrites } from './use-planner-location-writes';

const SYSTEM = { systemId: 30002537, systemName: 'Amamake', security: 0.4 };
const DATA: BuildLocationData = {
  stations: [],
  costIndices: { manufacturing: 0.04, reaction: 0.06 },
  adjustedPrices: [{ typeId: 34, adjustedPrice: 10 }],
};
const setLocation = vi.fn();
const setReactionLocation = vi.fn();
function resetRenderState() {
  h.cursor = 0;
  h.reads = [];
}
function useWrites(activityId: number, reactionSystemId: number | null = SYSTEM.systemId, snapshot: ReactionLocationSnapshot | null = null) {
  const state = usePlannerLocationWrites(
    { blueprintTypeId: 100, activityId } as BlueprintStructure,
    setLocation,
    reactionSystemId,
    setReactionLocation,
    snapshot,
  );
  const reaction = h.reads[0];
  if (!reaction) throw new Error('reaction reader was not registered');
  return { ...state, reaction };
}

beforeEach(() => {
  h.states = [];
  resetRenderState();
  h.apiFetch.mockReset();
  setLocation.mockClear();
  setReactionLocation.mockClear();
});

test('a manufacturing blip the next attempt clears applies fees without a failure', async () => {
  h.apiFetch.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, data: DATA });
  const state = useWrites(MANUFACTURING_ACTIVITY);
  await expect(state.applyBuildSystem(SYSTEM, { persist: false })).resolves.toMatchObject({ status: 'applied' });
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  resetRenderState();
  expect(useWrites(MANUFACTURING_ACTIVITY).failureSystemId).toBeNull();
});

test('the system priced until now stays while the next is read, so it is asked for once', async () => {
  let release!: (result: { ok: boolean; data: BuildLocationData }) => void;
  h.apiFetch.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
  const pending = useWrites(MANUFACTURING_ACTIVITY).applyBuildSystem(SYSTEM, { persist: false });
  expect(setLocation).not.toHaveBeenCalled();
  release({ ok: true, data: DATA });
  await expect(pending).resolves.toMatchObject({ status: 'applied' });
  expect(setLocation.mock.calls).toEqual([[{ ...SYSTEM, ...DATA, adjustedPrices: new Map([[34, 10]]) }]]);
  expect(h.apiFetch).toHaveBeenCalledTimes(1);
});

test.each(['response', 'network'])('manufacturing %s failure after three attempts clears old fees; Retry clears the notice until success applies current fees', async (failure) => {
  if (failure === 'response') h.apiFetch.mockResolvedValue({ ok: false });
  else h.apiFetch.mockRejectedValue(new Error('offline'));
  let state = useWrites(MANUFACTURING_ACTIVITY);
  await expect(state.applyBuildSystem(SYSTEM, { persist: false })).resolves.toEqual({ status: 'failed' });
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
  expect(setLocation).toHaveBeenCalledWith(null);
  resetRenderState();
  state = useWrites(MANUFACTURING_ACTIVITY);
  expect(state.failureSystemId).toBe(SYSTEM.systemId);
  state.retryLocation();
  resetRenderState();
  state = useWrites(MANUFACTURING_ACTIVITY);
  expect(state.retry).toBe(1);
  expect(state.failureSystemId).toBeNull();
  h.apiFetch.mockReset();
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: DATA });
  await state.applyBuildSystem(SYSTEM, { persist: false });
  expect(setLocation).toHaveBeenLastCalledWith({ ...SYSTEM, ...DATA, adjustedPrices: new Map([[34, 10]]) });
  resetRenderState();
  expect(useWrites(MANUFACTURING_ACTIVITY).failureSystemId).toBeNull();
});

test.each(['response', 'network'])('reaction %s failure after three attempts clears old fees; Retry clears the notice and refreshes until successful', async (failure) => {
  if (failure === 'response') h.apiFetch.mockResolvedValue({ ok: false });
  else h.apiFetch.mockRejectedValue(new Error('offline'));
  let state = useWrites(REACTION_ACTIVITY);
  expect(state.reaction.enabled).toBe(true);
  expect(state.reactionPending).toBe(true);
  await expect(state.reaction.read(new AbortController().signal)).resolves.toBeNull();
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
  expect(setReactionLocation).toHaveBeenCalledWith(null);
  resetRenderState();
  state = useWrites(REACTION_ACTIVITY);
  expect(state.failureSystemId).toBe(SYSTEM.systemId);
  // A failed read is not still waited on.
  expect(state.reactionPending).toBe(false);
  state.retryLocation();
  resetRenderState();
  state = useWrites(REACTION_ACTIVITY);
  expect(state.reactionPending).toBe(true);
  expect(state.reaction.refreshKey).toBe(1);
  expect(state.failureSystemId).toBeNull();
  h.apiFetch.mockReset();
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: DATA });
  await expect(state.reaction.read(new AbortController().signal)).resolves.toEqual({
    systemId: SYSTEM.systemId, blueprintTypeId: 100, costIndex: 0.06, adjustedPrices: new Map([[34, 10]]),
  });
  resetRenderState();
  expect(useWrites(REACTION_ACTIVITY).failureSystemId).toBeNull();
});

test.each([MANUFACTURING_ACTIVITY, REACTION_ACTIVITY])('cancelled activity %i read cannot apply an old profile result or publish a failure', async (activityId) => {
  let release!: (result: { ok: boolean; data: BuildLocationData }) => void;
  h.apiFetch.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
  const state = useWrites(activityId);
  const controller = new AbortController();
  const pending = activityId === REACTION_ACTIVITY
    ? state.reaction.read(controller.signal)
    : state.applyBuildSystem(SYSTEM, { persist: false, signal: controller.signal });
  controller.abort();
  release({ ok: true, data: DATA });
  await pending;
  resetRenderState();
  expect(useWrites(activityId).failureSystemId).toBeNull();
  expect(setLocation).not.toHaveBeenCalled();
  expect(setReactionLocation.mock.calls).toEqual(activityId === REACTION_ACTIVITY ? [[null]] : []);
});

test('a profile with no reaction system disables the read and cannot fetch fees', async () => {
  const state = useWrites(REACTION_ACTIVITY, null);
  expect(state.reaction.enabled).toBe(false);
  await expect(state.reaction.read(new AbortController().signal)).resolves.toBeNull();
  expect(h.apiFetch).not.toHaveBeenCalled();
});


test('component Retry reuses a valid current reaction snapshot without clearing root fees', () => {
  const snapshot = { systemId: SYSTEM.systemId, blueprintTypeId: 100, costIndex: 0.06, adjustedPrices: new Map([[34, 10]]) };
  let state = useWrites(REACTION_ACTIVITY, SYSTEM.systemId, snapshot);
  expect(state.reaction.enabled).toBe(false);
  expect(state.reactionPending).toBe(false);
  state.retryLocation();
  resetRenderState();
  state = useWrites(REACTION_ACTIVITY, SYSTEM.systemId, snapshot);
  expect(state.retry).toBe(1);
  expect(state.reaction.enabled).toBe(false);
  expect(setReactionLocation).not.toHaveBeenCalled();
  expect(h.apiFetch).not.toHaveBeenCalled();
});

test.each([
  { systemId: 30000142, blueprintTypeId: 100 },
  { systemId: SYSTEM.systemId, blueprintTypeId: 101 },
])('a snapshot from another system or blueprint still reads the current reaction fees: %j', (key) => {
  const state = useWrites(REACTION_ACTIVITY, SYSTEM.systemId, { ...key, costIndex: 0.06, adjustedPrices: new Map() });
  expect(state.reaction.enabled).toBe(true);
});
