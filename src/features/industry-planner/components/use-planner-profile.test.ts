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
  profilesFailed: false,
  refreshProfiles: vi.fn(),
  plan: null as ProfilePlan | null,
  readLevels: null as ((signal: AbortSignal) => Promise<unknown>) | null,
  apiFetch: vi.fn(),
}));

vi.mock('react', () => ({
  useState: <T>(init: T) => [init, vi.fn()],
  useEffect: (effect: () => void) => effect(),
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
    setLocation: vi.fn(),
    availableStructures: [SOTIYO],
    structureFactors: MANUAL,
    applyBuildSystem: vi.fn(async () => ({ ok: true }) as never),
    setSelectedStructure: vi.fn(),
    setReactionSystem: vi.fn(),
    setReactionStructure: vi.fn(),
  };
}

const built = (activityId: number) =>
  ({ blueprintTypeId: 100, activityId, nodeActivityByBlueprint: {} }) as unknown as BlueprintStructure;

beforeEach(() => {
  h.profileId = null;
  h.profiles = null;
  h.profilesFailed = false;
  h.plan = null;
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
  expect(state).toMatchObject({ profile: null, plan: null, structureFactors: MANUAL, skillTimeFactors: null });
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
  expect(state).toMatchObject({ profile: CAPS, structureFactors: PROFILE });
  expect(w.setSelectedStructure).toHaveBeenCalledWith(null);
  expect(w.applyBuildSystem).toHaveBeenCalledWith(
    { systemId: 30002537, systemName: 'Amamake', security: 0.4 },
    { persist: false },
  );
});

test('a structure in the system already in use only swaps the structure', () => {
  h.profiles = [CAPS];
  h.plan = planAt(facility({}));
  const w = writers(30004759);
  useProfileFactors(built(MANUFACTURING_ACTIVITY), w);
  expect(w.setSelectedStructure).toHaveBeenCalledWith(SOTIYO);
  expect(w.applyBuildSystem).not.toHaveBeenCalled();
  expect(w.setLocation).not.toHaveBeenCalled();
});

test('a reaction runs at the facility the profile gives reactions', () => {
  h.profiles = [CAPS];
  h.plan = planAt(facility({}));
  const w = writers(30002537);
  useProfileFactors(built(REACTION_ACTIVITY), w);
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
