import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/composition/map-affiliation-access', () => ({ reconcileAffiliationAccess: vi.fn() }));

const mocks = vi.hoisted(() => ({
  refreshAffiliationsWithOutcome: vi.fn(),
  getUserAffiliations: vi.fn(),
  recordCorpAccessDecision: vi.fn(),
  vendTokenFor: vi.fn(),
  probeAndStoreRoles: vi.fn(),
}));

vi.mock('@/platform/auth/affiliation', () => ({
  refreshAffiliationsWithOutcome: mocks.refreshAffiliationsWithOutcome,
}));
vi.mock('@/platform/auth/affiliation-store', () => ({
  getUserAffiliations: mocks.getUserAffiliations,
  recordCorpAccessDecision: mocks.recordCorpAccessDecision,
}));
vi.mock('./sync/owner-sync-port', () => ({
  probeAndStoreRoles: mocks.probeAndStoreRoles,
  vendTokenFor: mocks.vendTokenFor,
}));

import { directorGate, stationManagerGate } from './corp-role-gates';

const CORP = 2000;

function linked(characterIds: number[], corporationId = CORP) {
  return characterIds.map((characterId) => ({
    characterId,
    corporationId,
    allianceId: null,
    factionId: null,
    refreshedAt: new Date(),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refreshAffiliationsWithOutcome.mockResolvedValue({ refreshed: 0, accessChanged: false, transientFailure: false });
  mocks.vendTokenFor.mockResolvedValue('token');
});

describe('stationManagerGate', () => {
  it('reuses one snapshot for membership and roles, trying another linked pilot when needed', async () => {
    mocks.getUserAffiliations.mockResolvedValue(linked([101, 102]));
    mocks.vendTokenFor.mockResolvedValueOnce(null).mockResolvedValueOnce('token');
    mocks.probeAndStoreRoles.mockResolvedValue(['Station_Manager']);
    await expect(stationManagerGate('u1', CORP)).resolves.toEqual({ ok: true });
    expect(mocks.getUserAffiliations).toHaveBeenCalledOnce();
    expect(mocks.probeAndStoreRoles).toHaveBeenCalledWith(102, 'token', CORP);
    expect(mocks.recordCorpAccessDecision).toHaveBeenCalledWith(expect.objectContaining({ allowed: true }));
  });

  it('lets a Director edit structures', async () => {
    mocks.getUserAffiliations.mockResolvedValue(linked([101]));
    mocks.probeAndStoreRoles.mockResolvedValue(['Director']);
    await expect(stationManagerGate('u1', CORP)).resolves.toEqual({ ok: true });
  });

  it('refuses a member with neither role', async () => {
    mocks.getUserAffiliations.mockResolvedValue(linked([101]));
    mocks.probeAndStoreRoles.mockResolvedValue(['Accountant']);
    await expect(stationManagerGate('u1', CORP)).resolves.toEqual({
      ok: false,
      failure: {
        category: 'forbidden',
        code: 'not_station_manager',
        detail: 'Requires the Station Manager or Director role',
      },
    });
  });

  it('denies a departed member before vending tokens or checking roles', async () => {
    mocks.getUserAffiliations.mockResolvedValue(linked([101], 3000));
    await expect(stationManagerGate('u1', CORP)).resolves.toMatchObject({
      ok: false,
      failure: { code: 'not_corp_member' },
    });
    expect(mocks.vendTokenFor).not.toHaveBeenCalled();
    expect(mocks.recordCorpAccessDecision).toHaveBeenCalledWith(expect.objectContaining({ allowed: false }));
  });
});

describe('directorGate', () => {
  it('refuses a Station Manager', async () => {
    mocks.getUserAffiliations.mockResolvedValue(linked([101]));
    mocks.probeAndStoreRoles.mockResolvedValue(['Station_Manager']);
    await expect(directorGate('u1', CORP)).resolves.toEqual({
      ok: false,
      failure: { category: 'forbidden', code: 'not_director', detail: 'Requires the Director role' },
    });
  });

  it('fails closed when the bound role probe rejects a corporation change', async () => {
    mocks.getUserAffiliations.mockResolvedValue(linked([101]));
    mocks.probeAndStoreRoles.mockImplementation(async (_id, _token, expectedCorporationId) =>
      expectedCorporationId === CORP ? null : ['Director'],
    );
    await expect(directorGate('u1', CORP)).resolves.toMatchObject({
      ok: false, failure: { code: 'not_director' },
    });
  });

  it('allows a Director', async () => {
    mocks.getUserAffiliations.mockResolvedValue(linked([101]));
    mocks.probeAndStoreRoles.mockResolvedValue(['Director']);
    await expect(directorGate('u1', CORP)).resolves.toEqual({ ok: true });
    expect(mocks.probeAndStoreRoles).toHaveBeenCalledWith(101, 'token', CORP);
  });
});
