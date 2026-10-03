import { beforeEach, expect, test, vi } from 'vitest';
import type { IndustryProfileRow } from '../profiles/api-contract';
import { emptyProfileDocument } from '../profiles/profile-document';
import type { PlanFacility, ProfilePlan } from '../profiles/profile-plan';
import { MANUFACTURING_ACTIVITY, REACTION_ACTIVITY } from '../structure-bonus';
import type { StructureFactors } from '../structure-factors';
import type { AvailableStructure, BlueprintStructure } from '../types';

const h = vi.hoisted(() => ({
  profileId: null as string | null,
  profiles: null as IndustryProfileRow[] | null,
  plan: null as ProfilePlan | null,
  readLevels: null as ((signal: AbortSignal) => Promise<unknown>) | null,
  apiFetch: vi.fn(),
  cleanups: [] as (() => void)[],
}));

vi.mock('react', () => ({
  useState: <T>(init: T) => [init, vi.fn()],
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) h.cleanups.push(cleanup);
  },
  useMemo: <T>(make: () => T) => make(),
  useCallback: <T>(fn: T) => fn,
}));
vi.mock('@/components/PreferencesProvider', () => ({ usePreference: () => [h.profileId, vi.fn()] }));
vi.mock('@/components/use-system-search', () => ({
  useSystemSearch: () => ({
    systems: [
      { id: 30002537, name: 'Amamake', security: 0.4 },
      { id: 30004759, name: '1DQ1-A', security: -0.4 },
    ],
  }),
}));
vi.mock('@/platform/auth/components/AuthProvider', () => ({ useAuth: () => ({ session: {} }) }));
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));
vi.mock('../profiles/use-industry-profiles', () => ({ useIndustryProfiles: () => ({ profiles: h.profiles }) }));
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

function writers(currentSystemId: number | null = null) {
  return {
    location: currentSystemId === null ? null : ({ systemId: currentSystemId } as never),
    availableStructures: [SOTIYO],
    structureFactors: MANUAL,
    applyBuildSystem: vi.fn(async () => ({ status: 'applied' }) as never),
    setSelectedStructure: vi.fn(),
    setStation: vi.fn(),
    setReactionSystem: vi.fn(),
    setReactionStructure: vi.fn(),
  };
}

const built = (activityId: number) =>
  ({ blueprintTypeId: 100, activityId, nodeActivityByBlueprint: {} }) as unknown as BlueprintStructure;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  h.profileId = null;
  h.profiles = null;
  h.plan = null;
  h.cleanups = [];
});

test('without a profile the picked structures and build character apply', () => {
  h.profiles = [CAPS];
  const w = writers();
  const state = useProfileFactors(built(MANUFACTURING_ACTIVITY), w);
  expect(state).toMatchObject({ profile: null, plan: null, structureFactors: MANUAL, skillTimeFactors: null });
  expect(w.setSelectedStructure).not.toHaveBeenCalled();
  expect(w.applyBuildSystem).not.toHaveBeenCalled();
});

test('a profile prices the product where its facility stands, moving the build there', async () => {
  h.profileId = 'caps';
  h.profiles = [CAPS];
  h.plan = planAt(facility({ kind: 'station', id: '60003760', name: 'Jita IV - Moon 4', structure: null, systemId: 30002537 }));
  const w = writers(30004759);
  const state = useProfileFactors(built(MANUFACTURING_ACTIVITY), w);
  expect(state).toMatchObject({ profile: CAPS, structureFactors: PROFILE });
  expect(w.setSelectedStructure).toHaveBeenCalledWith(null);
  expect(w.applyBuildSystem).toHaveBeenCalledWith(
    { systemId: 30002537, systemName: 'Amamake', security: 0.4 },
    { persist: false },
  );
  await settle();
  expect(w.setStation).toHaveBeenCalledWith(60003760, 'Jita IV - Moon 4');
});

test('a structure in the system already in use swaps the structure and clears any station', async () => {
  h.profileId = 'caps';
  h.profiles = [CAPS];
  h.plan = planAt(facility({}));
  const w = writers(30004759);
  useProfileFactors(built(MANUFACTURING_ACTIVITY), w);
  expect(w.setSelectedStructure).toHaveBeenCalledWith(SOTIYO);
  expect(w.applyBuildSystem).not.toHaveBeenCalled();
  expect(w.setStation).toHaveBeenCalledWith(null, 'Sotiyo');

  const moved = writers(30002537);
  useProfileFactors(built(MANUFACTURING_ACTIVITY), moved);
  await settle();
  expect(moved.applyBuildSystem).toHaveBeenCalledTimes(1);
  expect(moved.setStation).toHaveBeenCalledWith(null, 'Sotiyo');
});

test('a station in the current system applies without fetching a new system', () => {
  h.profileId = 'caps';
  h.profiles = [CAPS];
  h.plan = planAt(facility({ kind: 'station', id: '60003760', name: 'Station', structure: null }));
  const w = writers(30004759);
  useProfileFactors(built(MANUFACTURING_ACTIVITY), w);
  expect(w.applyBuildSystem).not.toHaveBeenCalled();
  expect(w.setStation).toHaveBeenCalledWith(60003760, 'Station');
});

test.each(['failed', 'superseded'])('a %s system request cannot select its profile station', async (status) => {
  h.profileId = 'caps';
  h.profiles = [CAPS];
  h.plan = planAt(facility({ kind: 'station', id: '60003760', structure: null }));
  const w = writers(30002537);
  w.applyBuildSystem.mockImplementation(async () => ({ status }) as never);
  useProfileFactors(built(MANUFACTURING_ACTIVITY), w);
  await settle();
  expect(w.setStation).not.toHaveBeenCalled();
});

test('changing profile cancels the station write from its previous pending system request', async () => {
  h.profileId = 'caps';
  h.profiles = [CAPS];
  h.plan = planAt(facility({ kind: 'station', id: '60003760', structure: null }));
  const w = writers(30002537);
  let complete!: (value: never) => void;
  w.applyBuildSystem.mockImplementation(() => new Promise<never>((resolve) => { complete = resolve; }));
  useProfileFactors(built(MANUFACTURING_ACTIVITY), w);
  for (const cleanup of h.cleanups) cleanup();
  h.profileId = null;
  useProfileFactors(built(MANUFACTURING_ACTIVITY), w);
  complete({ status: 'applied' } as never);
  await settle();
  expect(w.setStation).not.toHaveBeenCalled();
});

test('a reaction runs at the facility the profile gives reactions', () => {
  h.profileId = 'caps';
  h.profiles = [CAPS];
  h.plan = planAt(facility({}));
  const w = writers(30002537);
  useProfileFactors(built(REACTION_ACTIVITY), w);
  expect(w.setReactionSystem).toHaveBeenCalledWith({ systemId: 30004759, systemName: '1DQ1-A', security: -0.4 });
  expect(w.setReactionStructure).toHaveBeenCalledWith(SOTIYO);
  expect(w.setSelectedStructure).not.toHaveBeenCalled();
  expect(w.applyBuildSystem).not.toHaveBeenCalled();
});

test('a facility with no known system leaves the location alone', () => {
  h.profileId = 'caps';
  h.profiles = [CAPS];
  h.plan = planAt(facility({ systemId: null }));
  const w = writers();
  useProfileFactors(built(MANUFACTURING_ACTIVITY), w);
  h.plan = planAt(null);
  useProfileFactors(built(MANUFACTURING_ACTIVITY), w);
  expect(w.setSelectedStructure).not.toHaveBeenCalled();
  expect(w.setReactionSystem).not.toHaveBeenCalled();
});

test('team skills load per character, and a failed read gives none', async () => {
  h.profileId = 'caps';
  h.profiles = [CAPS];
  useProfileFactors(built(MANUFACTURING_ACTIVITY), writers());
  const signal = new AbortController().signal;
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { characters: [{ characterId: 9001, levels: { 3380: 5 } }] } });
  expect(await h.readLevels!(signal)).toEqual(new Map([[9001, { 3380: 5 }]]));
  h.apiFetch.mockResolvedValueOnce({ ok: false });
  expect(await h.readLevels!(signal)).toBeNull();
});
