import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/composition/map-affiliation-access', () => ({
  reconcileAffiliationAccess: vi.fn(),
  scheduleAccessDrain: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  connection: vi.fn(),
  refreshAffiliationsWithOutcome: vi.fn(),
  getUserAffiliations: vi.fn(),
  getCorpStructures: vi.fn(),
  listCorpStructureSyncStates: vi.fn(),
  readCorpStructureSharings: vi.fn(),
  vendTokenFor: vi.fn(),
  readRolesFor: vi.fn(),
  recordCorpAccessDecision: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: mocks.after,
  connection: mocks.connection,
}));

vi.mock('@/platform/auth/affiliation', () => ({
  refreshAffiliationsWithOutcome: mocks.refreshAffiliationsWithOutcome,
}));

vi.mock('@/platform/auth/affiliation-store', () => ({
  getUserAffiliations: mocks.getUserAffiliations,
  recordCorpAccessDecision: mocks.recordCorpAccessDecision,
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connection.mockResolvedValue(undefined);
  mocks.refreshAffiliationsWithOutcome.mockResolvedValue({ refreshed: 0, accessChanged: false, transientFailure: false });
  mocks.getUserAffiliations.mockResolvedValue([]);
  mocks.getCorpStructures.mockResolvedValue(new Map());
  mocks.listCorpStructureSyncStates.mockResolvedValue([]);
  mocks.readCorpStructureSharings.mockResolvedValue(new Map());
});

describe('corp structure affiliation refresh', () => {
  it('waits for a real request before affiliation ESI on both read seams', async () => {
    await expect(getCorpStructuresPageData('user-1')).resolves.toEqual([]);
    await expect(getCorpStructuresForUserOnView('user-1')).resolves.toEqual({
      corporations: [],
    });

    expect(mocks.connection).toHaveBeenCalledTimes(2);
    expect(mocks.getUserAffiliations).toHaveBeenCalledTimes(2);
    expect(mocks.refreshAffiliationsWithOutcome).not.toHaveBeenCalled();
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getUserAffiliations.mock.invocationCallOrder[0]!,
    );
    expect(mocks.connection.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.getUserAffiliations.mock.invocationCallOrder[1]!,
    );
  });
});

describe('station manager authorization', () => {
  it('reuses one snapshot for membership and roles, trying another linked pilot when needed', async () => {
    mocks.getUserAffiliations.mockResolvedValue([101, 102].map((characterId) => ({
      characterId, corporationId: 2000, allianceId: null, factionId: null, refreshedAt: new Date(),
    })));
    mocks.vendTokenFor.mockResolvedValueOnce(null).mockResolvedValueOnce('token');
    mocks.readRolesFor.mockResolvedValue(['Station_Manager']);
    await expect(stationManagerGate('u1', 2000)).resolves.toEqual({ ok: true });
    expect(mocks.getUserAffiliations).toHaveBeenCalledOnce();
    expect(mocks.readRolesFor).toHaveBeenCalledWith(102, 'token');
    expect(mocks.recordCorpAccessDecision).toHaveBeenCalledWith(expect.objectContaining({ allowed: true }));
  });

  it('denies a departed member before vending tokens or checking roles', async () => {
    mocks.getUserAffiliations.mockResolvedValue([{
      characterId: 101, corporationId: 3000, allianceId: null, factionId: null, refreshedAt: new Date(),
    }]);
    await expect(stationManagerGate('u1', 2000)).resolves.toMatchObject({ ok: false });
    expect(mocks.vendTokenFor).not.toHaveBeenCalled();
    expect(mocks.recordCorpAccessDecision).toHaveBeenCalledWith(expect.objectContaining({ allowed: false }));
  });
});
