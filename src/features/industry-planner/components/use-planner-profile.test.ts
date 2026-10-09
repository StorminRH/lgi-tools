import { beforeEach, expect, test, vi } from 'vitest';
import type { IndustryProfileRow } from '../profiles/api-contract';
import { emptyProfileDocument } from '../profiles/profile-document';
import type { PlanFacility, ProfilePlan } from '../profiles/profile-plan';
import { MANUFACTURING_ACTIVITY, REACTION_ACTIVITY } from '../structure-bonus';
import type { StructureFactors } from '../structure-factors';
import type { AvailableStructure, BlueprintStructure, BuildLocationData } from '../types';
import type { SelectedLocation } from './planner-contexts';

const h = vi.hoisted(() => ({
  profileId: null as string | null,
  profiles: null as IndustryProfileRow[] | null,
  profilesFailed: false,
  refreshProfiles: vi.fn(),
  plan: null as ProfilePlan | null,
  readLevels: null as ((signal: AbortSignal) => Promise<unknown>) | null,
  apiFetch: vi.fn(),
  states: [] as unknown[],
  stateCursor: 0,
  memos: [] as { deps: unknown[]; value: unknown }[],
  memoCursor: 0,
  effects: [] as { deps: unknown[]; cleanup?: (() => void) | void }[],
  effectCursor: 0,
  systems: [
    { id: 30002537, name: 'Amamake', security: 0.4 },
    { id: 30004759, name: '1DQ1-A', security: -0.4 },
  ],
}));

vi.mock('react', () => ({
  useState: <T>(init: T) => {
    const index = h.stateCursor++;
    if (h.states.length <= index) h.states[index] = init;
    return [h.states[index], (next: T | ((previous: T) => T)) => {
      h.states[index] = typeof next === 'function' ? (next as (previous: T) => T)(h.states[index] as T) : next;
    }];
  },
  useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
    const index = h.effectCursor++;
    const previous = h.effects[index];
    if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
    previous?.cleanup?.();
    h.effects[index] = { deps, cleanup: effect() };
  },
  useMemo: <T>(make: () => T, deps: unknown[]) => {
    const index = h.memoCursor++;
    const previous = h.memos[index];
    if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return previous.value;
    const value = make();
    h.memos[index] = { deps, value };
    return value;
  },
  useCallback: <T>(fn: T) => fn,
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));
vi.mock('@/components/PreferencesProvider', () => ({ usePreference: () => [h.profileId, vi.fn()] }));
vi.mock('@/components/use-system-search', () => ({
  useSystemSearch: () => ({ systems: h.systems }),
}));
vi.mock('@/platform/auth/components/AuthProvider', () => ({ useAuth: () => ({ session: {} }) }));
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));
vi.mock('../read-with-retries', async (load) => {
  const { readWithRetries } = await load<typeof import('../read-with-retries')>();
  return { readWithRetries: (read: () => Promise<unknown>, signal?: AbortSignal) => readWithRetries(read, signal, [0, 0]) };
});
vi.mock('../profiles/use-industry-profiles', () => ({ useIndustryProfiles: () => ({ profiles: h.profiles, listFailed: h.profilesFailed, refresh: h.refreshProfiles }) }));
vi.mock('../use-resource-read', () => ({
  useResourceRead: (read: (signal: AbortSignal) => Promise<unknown>) => {
    h.readLevels = read;
  },
}));
vi.mock('../profiles/profile-plan', () => ({
  planFacilities: () => [],
  planMembers: () => [],
  profilePlan: () => h.plan,
}));

import { useProfileFactors } from './use-planner-profile';
import { usePlannerLocationWrites } from './use-planner-location-writes';

const MANUAL: StructureFactors = { me: 0.99 } as unknown as StructureFactors;
const PROFILE: StructureFactors = { me: 0.95 } as unknown as StructureFactors;
const SOTIYO = { id: 'cs-1', name: 'Sotiyo' } as AvailableStructure;
const CAPS: IndustryProfileRow = {
  id: 'caps',
  name: 'Capital line',
  revision: 1,
  document: emptyProfileDocument([{ characterId: 9001, name: 'Builder' }]),
  updatedAt: '2026-10-02T00:00:00.000Z',
};

const facility = (over: Partial<PlanFacility>): PlanFacility => ({
  key: 'f',
  id: 'cs-1',
  name: 'Sotiyo',
  kind: 'structure',
  structure: SOTIYO,
  systemId: 30004759,
  security: -0.4,
  categories: [],
  ...over,
});
const planAt = (top: PlanFacility | null): ProfilePlan => ({
  structureFactors: PROFILE,
  skillTimeFactors: { 1: 0.9 } as unknown as ProfilePlan['skillTimeFactors'],
  routeOf: () => ({ facility: top, characterId: 9001, bonus: null }),
  top: { facility: top, characterId: 9001, bonus: null },
});

function writers(currentSystemId: number | null = null, failureSystemId: number | null = null) {
  return {
    locationRefreshKey: 0,
    failureSystemId,
    location: currentSystemId === null ? null : ({ systemId: currentSystemId } as never),
    setLocation: vi.fn(),
    availableStructures: [SOTIYO],
    structureFactors: MANUAL,
    applyBuildSystem: vi.fn(async () => ({ status: 'failed' as const })),
    setSelectedStructure: vi.fn(),
    setReactionSystem: vi.fn(),
    setReactionStructure: vi.fn(),
  };
}

const built = (activityId: number) =>
  ({ blueprintTypeId: 100, activityId, nodeActivityByBlueprint: {} }) as unknown as BlueprintStructure;

const FEE_DATA: BuildLocationData = {
  stations: [],
  costIndices: { manufacturing: 0.04, reaction: 0.06 },
  adjustedPrices: [{ typeId: 34, adjustedPrice: 10 }],
};
const AVAILABLE = [SOTIYO];
let pricedLocation: SelectedLocation | null = null;
const publishLocation = (next: SelectedLocation | null) => { pricedLocation = next; };
const ignoreReactionLocation = vi.fn();
const selectStructure = vi.fn();
const selectReactionSystem = vi.fn();
const selectReactionStructure = vi.fn();

function FeeHarness(structure: BlueprintStructure) {
  const writes = usePlannerLocationWrites(
    structure, publishLocation, null, ignoreReactionLocation, null,
  );
  const factors = useProfileFactors(structure, {
    ...writes,
    locationRefreshKey: writes.retry,
    location: pricedLocation,
    setLocation: publishLocation,
    availableStructures: AVAILABLE,
    structureFactors: MANUAL,
    setSelectedStructure: selectStructure,
    setReactionSystem: selectReactionSystem,
    setReactionStructure: selectReactionStructure,
  });
  return { ...factors, ...writes };
}

function renderFees(structure: BlueprintStructure) {
  h.stateCursor = 0;
  h.memoCursor = 0;
  h.effectCursor = 0;
  return FeeHarness(structure);
}

beforeEach(() => {
  h.profileId = null;
  h.profiles = null;
  h.profilesFailed = false;
  h.plan = null;
  h.states = [];
  h.memos = [];
  h.effects = [];
  h.stateCursor = 0;
  h.memoCursor = 0;
  h.effectCursor = 0;
  h.apiFetch.mockReset();
  pricedLocation = null;
});

test('failed profile fees clear the previous system after three attempts and wait for explicit Retry', async () => {
  h.profiles = [CAPS];
  h.plan = planAt(facility({ systemId: 30002537 }));
  pricedLocation = { systemId: 30004759 } as SelectedLocation;
  const structure = built(MANUFACTURING_ACTIVITY);
  h.apiFetch.mockResolvedValue({ ok: false });
  expect(renderFees(structure).locationPending).toBe(true);
  await vi.waitFor(() => expect(h.states[0]).toBe(30002537));
  expect(pricedLocation).toBeNull();
  const failed = renderFees(structure);
  expect(failed.locationPending).toBe(false);
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
  renderFees(structure);
  expect(h.apiFetch).toHaveBeenCalledTimes(3);

  h.apiFetch.mockResolvedValue({ ok: true, data: FEE_DATA });
  failed.retryLocation();
  const retrying = renderFees(structure);
  expect(retrying.locationPending).toBe(true);
  expect(retrying.failureSystemId).toBeNull();
  await vi.waitFor(() => expect(pricedLocation?.systemId).toBe(30002537));
  expect(h.apiFetch).toHaveBeenCalledTimes(4);
  expect(pricedLocation).toMatchObject({ costIndices: { manufacturing: 0.04 }, adjustedPrices: new Map([[34, 10]]) });
  expect(renderFees(structure).locationPending).toBe(false);
  expect(h.apiFetch).toHaveBeenCalledTimes(4);
});

test.each(['profile', 'facility', 'blueprint', 'activity', 'system'] as const)(
  'changing %s starts a fresh fee read after the previous selection failed', async (change) => {
    h.profiles = [CAPS];
    h.plan = planAt(facility({ structure: null, systemId: 30002537 }));
    let structure = built(MANUFACTURING_ACTIVITY);
    h.apiFetch.mockResolvedValue({ ok: false });
    renderFees(structure);
    await vi.waitFor(() => expect(h.apiFetch).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(h.states[0]).toBe(30002537));
    renderFees(structure);
    if (change === 'profile') h.profiles = [{ ...CAPS, id: 'other' }];
    if (change === 'facility') h.plan = planAt(facility({ id: 'another-station', structure: null, systemId: 30002537 }));
    if (change === 'blueprint') structure = { ...structure, blueprintTypeId: 101 };
    if (change === 'activity') structure = { ...structure, activityId: 8 };
    if (change === 'system') h.plan = planAt(facility({ systemId: 30004759 }));
    renderFees(structure);
    await vi.waitFor(() => expect(h.apiFetch).toHaveBeenCalledTimes(6));
    await vi.waitFor(() => expect(h.states[0]).toBe(change === 'system' ? 30004759 : 30002537));
  },
);

test('a hidden planner aborts its fee read and re-showing its preserved state reads again', async () => {
  h.profiles = [CAPS];
  h.plan = planAt(facility({ systemId: 30002537 }));
  const structure = built(MANUFACTURING_ACTIVITY);
  let release!: (result: { ok: true; data: BuildLocationData }) => void;
  h.apiFetch.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }))
    .mockResolvedValueOnce({ ok: true, data: FEE_DATA });
  renderFees(structure);
  expect(h.apiFetch).toHaveBeenCalledOnce();
  const firstSignal = h.apiFetch.mock.calls[0]![1].signal as AbortSignal;
  // Activity cleans up effects while retaining hook state and memoized values.
  for (const effect of h.effects) effect.cleanup?.();
  h.effects = [];
  expect(firstSignal.aborted).toBe(true);
  renderFees(structure);
  release({ ok: true, data: FEE_DATA });
  await vi.waitFor(() => expect(pricedLocation?.systemId).toBe(30002537));
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  expect(renderFees(structure).failureSystemId).toBeNull();
});

test('a failed profile list stays at baseline and exposes the existing retry callback', () => {
  h.profilesFailed = true;
  const state = useProfileFactors(built(MANUFACTURING_ACTIVITY), writers());
  expect(state).toMatchObject({ profiles: null, profile: null, plan: null, profilesFailed: true, structureFactors: MANUAL });
  expect(state.refreshProfiles).toBe(h.refreshProfiles);
});

test('the planner builds with the profile last used, or else the first', () => {
  const OTHER: IndustryProfileRow = { ...CAPS, id: 'other', name: 'Other line' };
  h.profiles = [CAPS, OTHER];
  expect(useProfileFactors(built(MANUFACTURING_ACTIVITY), writers()).profile).toBe(CAPS);
  h.profileId = 'other';
  expect(useProfileFactors(built(MANUFACTURING_ACTIVITY), writers()).profile).toBe(OTHER);
  h.profileId = 'gone';
  expect(useProfileFactors(built(MANUFACTURING_ACTIVITY), writers()).profile).toBe(CAPS);
});

test('with no profile the build is baseline, wherever it last priced', () => {
  h.profiles = [];
  const w = writers(30004759);
  const state = useProfileFactors(built(MANUFACTURING_ACTIVITY), w);
  expect(state).toMatchObject({ profile: null, plan: null, structureFactors: MANUAL, skillTimeFactors: null, locationPending: false });
  expect(w.setSelectedStructure).toHaveBeenCalledWith(null);
  expect(w.setLocation).toHaveBeenCalledWith(null);
  expect(w.applyBuildSystem).not.toHaveBeenCalled();

  const fresh = writers();
  useProfileFactors(built(MANUFACTURING_ACTIVITY), fresh);
  expect(fresh.setLocation).not.toHaveBeenCalled();
});

test('a profile prices the product where its facility stands, moving the build there', () => {
  h.profiles = [CAPS];
  h.plan = planAt(facility({ kind: 'station', id: '60003760', name: 'Jita IV - Moon 4', structure: null, systemId: 30002537 }));
  const w = writers(30004759);
  const state = useProfileFactors(built(MANUFACTURING_ACTIVITY), w);
  // The system priced until now stays while the new one is read.
  expect(state).toMatchObject({ profile: CAPS, structureFactors: PROFILE, locationPending: true });
  expect(w.setSelectedStructure).toHaveBeenCalledWith(null);
  expect(w.setLocation).not.toHaveBeenCalled();
  expect(w.applyBuildSystem).toHaveBeenCalledWith(
    { systemId: 30002537, systemName: 'Amamake', security: 0.4 },
    { persist: false, signal: expect.any(AbortSignal) },
  );
});

test('a structure in the system already in use only swaps the structure', () => {
  h.profiles = [CAPS];
  h.plan = planAt(facility({}));
  const w = writers(30004759);
  expect(useProfileFactors(built(MANUFACTURING_ACTIVITY), w).locationPending).toBe(false);
  expect(w.setSelectedStructure).toHaveBeenCalledWith(SOTIYO);
  expect(w.applyBuildSystem).not.toHaveBeenCalled();
  expect(w.setLocation).not.toHaveBeenCalled();
});

test('a reaction runs at the facility the profile gives reactions', () => {
  h.profiles = [CAPS];
  h.plan = planAt(facility({}));
  const w = writers(30002537);
  // A reaction's own read says when it is pending.
  expect(useProfileFactors(built(REACTION_ACTIVITY), w).locationPending).toBe(false);
  expect(w.setReactionSystem).toHaveBeenCalledWith({ systemId: 30004759, systemName: '1DQ1-A', security: -0.4 });
  expect(w.setReactionStructure).toHaveBeenCalledWith(SOTIYO);
  expect(w.setSelectedStructure).not.toHaveBeenCalled();
  expect(w.applyBuildSystem).not.toHaveBeenCalled();

  h.plan = planAt(null);
  const none = writers();
  useProfileFactors(built(REACTION_ACTIVITY), none);
  expect(none.setReactionSystem).toHaveBeenCalledWith(null);
  expect(none.setReactionStructure).toHaveBeenCalledWith(null);
});

test('a facility with no known system keeps its structure but prices at baseline', () => {
  h.profiles = [CAPS];
  h.plan = planAt(facility({ systemId: null }));
  const w = writers(30002537);
  useProfileFactors(built(MANUFACTURING_ACTIVITY), w);
  expect(w.setSelectedStructure).toHaveBeenCalledWith(SOTIYO);
  expect(w.setLocation).toHaveBeenCalledWith(null);
  expect(w.applyBuildSystem).not.toHaveBeenCalled();
});

test('team skills load per character, and a failed read gives none', async () => {
  h.profiles = [CAPS];
  useProfileFactors(built(MANUFACTURING_ACTIVITY), writers());
  const signal = new AbortController().signal;
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { characters: [{ characterId: 9001, levels: { 3380: 5 } }] } });
  expect(await h.readLevels!(signal)).toEqual(new Map([[9001, { 3380: 5 }]]));
  h.apiFetch.mockResolvedValueOnce({ ok: false });
  expect(await h.readLevels!(signal)).toBeNull();
});
