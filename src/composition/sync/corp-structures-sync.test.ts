import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserCorpAccess } from '@/platform/auth/user-corp-access';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  connection: vi.fn(),
  loadUserCorpAccess: vi.fn(),
  getCorpStructures: vi.fn(),
  listCorpStructureSyncStates: vi.fn(),
  readCorpStructureSharings: vi.fn(),
  vendTokenFor: vi.fn(),
  readRolesFor: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: mocks.after,
  connection: mocks.connection,
}));

vi.mock('@/platform/auth/user-corp-access', () => ({
  loadUserCorpAccess: mocks.loadUserCorpAccess,
}));

vi.mock('@/features/owned-structures/queries', () => ({
  getCorpStructureRigs: vi.fn(),
  getCorpStructures: mocks.getCorpStructures,
  isCorpStructureSharingEnabled: vi.fn(),
  listCorpStructureSyncStates: mocks.listCorpStructureSyncStates,
  readCorpStructureSharings: mocks.readCorpStructureSharings,
  readCorpStructureSyncState: vi.fn(),
  saveCorpStructures: vi.fn(),
  stampCorpStructuresFresh: vi.fn(),
}));

vi.mock('@/features/owned-structures/refresh', () => ({
  refreshCorpStructuresForUser: vi.fn(),
}));

vi.mock('@/data/eve-data/entity-names', () => ({
  resolveEntityNames: vi.fn(),
}));

vi.mock('./owner-sync-port', () => ({
  listCharactersWithHealth: vi.fn(),
  readPagedEndpoint: vi.fn(),
  readRolesFor: mocks.readRolesFor,
  vendTokenFor: mocks.vendTokenFor,
}));

import {
  getCorpStructuresForUserOnView,
  getCorpStructuresPageData,
  stationManagerGate,
} from './corp-structures-sync';

function emptyAccess(overrides: Partial<UserCorpAccess> = {}): UserCorpAccess {
  return {
    userId: 'user-1',
    characterIds: [],
    corporationIds: [],
    refreshTransientFailure: false,
    has: () => false,
    characterIdsIn: () => [],
    decide: async () => ({ allowed: false, reason: 'not_member', characterId: null }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connection.mockResolvedValue(undefined);
  mocks.loadUserCorpAccess.mockResolvedValue(emptyAccess());
  mocks.getCorpStructures.mockResolvedValue(new Map());
  mocks.listCorpStructureSyncStates.mockResolvedValue([]);
  mocks.readCorpStructureSharings.mockResolvedValue(new Map());
  mocks.vendTokenFor.mockResolvedValue(null);
  mocks.readRolesFor.mockResolvedValue(null);
});

describe('corp structure affiliation refresh', () => {
  it('waits for a real request before loading membership on both read seams', async () => {
    await expect(getCorpStructuresPageData('user-1')).resolves.toEqual([]);
    await expect(getCorpStructuresForUserOnView('user-1')).resolves.toEqual({
      corporations: [],
    });

    expect(mocks.connection).toHaveBeenCalledTimes(2);
    expect(mocks.loadUserCorpAccess).toHaveBeenCalledTimes(2);
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.loadUserCorpAccess.mock.invocationCallOrder[0]!,
    );
    expect(mocks.connection.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.loadUserCorpAccess.mock.invocationCallOrder[1]!,
    );
  });
});

describe('stationManagerGate', () => {
  it('denies when decide records not_member', async () => {
    mocks.loadUserCorpAccess.mockResolvedValue(emptyAccess());

    await expect(stationManagerGate('user-1', 2000)).resolves.toEqual({
      ok: false,
      failure: expect.objectContaining({ code: 'not_corp_member' }),
    });
    expect(mocks.vendTokenFor).not.toHaveBeenCalled();
  });

  it('denies when the user is a member without Station Manager', async () => {
    mocks.loadUserCorpAccess.mockResolvedValue(
      emptyAccess({
        characterIds: [101],
        corporationIds: [2000],
        has: (corporationId) => corporationId === 2000,
        characterIdsIn: (corporationId) => (corporationId === 2000 ? [101] : []),
        decide: async () => ({ allowed: true, reason: 'member', characterId: 101 }),
      }),
    );
    mocks.vendTokenFor.mockResolvedValue('token');
    mocks.readRolesFor.mockResolvedValue(['Director']);

    await expect(stationManagerGate('user-1', 2000)).resolves.toEqual({
      ok: false,
      failure: expect.objectContaining({ code: 'not_station_manager' }),
    });
  });

  it('allows a member who holds Station Manager', async () => {
    mocks.loadUserCorpAccess.mockResolvedValue(
      emptyAccess({
        characterIds: [101],
        corporationIds: [2000],
        has: (corporationId) => corporationId === 2000,
        characterIdsIn: (corporationId) => (corporationId === 2000 ? [101] : []),
        decide: async () => ({ allowed: true, reason: 'member', characterId: 101 }),
      }),
    );
    mocks.vendTokenFor.mockResolvedValue('token');
    mocks.readRolesFor.mockResolvedValue(['Station_Manager']);

    await expect(stationManagerGate('user-1', 2000)).resolves.toEqual({ ok: true });
  });
});
