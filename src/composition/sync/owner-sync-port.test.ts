import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';

const mocks = vi.hoisted(() => ({
  fetchAffiliations: vi.fn(),
  readEsiAuthed: vi.fn(),
  upsertCorpRoles: vi.fn(async () => true),
  readRoleCorporationId: vi.fn(async (): Promise<number | null> => 98001),
  getFreshAccessTokenForCharacter: vi.fn(),
}));

vi.mock('@/platform/auth/affiliation-source', () => ({
  fetchAffiliations: mocks.fetchAffiliations,
}));

vi.mock('@/platform/auth/eve-token-service', () => ({
  getFreshAccessTokenForCharacter: mocks.getFreshAccessTokenForCharacter,
}));

vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: vi.fn(),
}));

vi.mock('@/platform/auth/corp-roles-store', () => ({
  upsertCorpRoles: mocks.upsertCorpRoles,
  readRoleCorporationId: mocks.readRoleCorporationId,
}));

vi.mock('@/platform/esi/authed-read', () => ({
  readEsiAuthed: (...args: unknown[]) => mocks.readEsiAuthed(...args),
  readEsiPagedAuthed: vi.fn(),
}));

import { fetchAndStoreCorpRoles, probeAndStoreRoles } from './owner-sync-port';

const fullBody = {
  roles: ['Director', 'Accountant'],
  roles_at_hq: ['Hangar_Query_1'],
  roles_at_base: [],
  roles_at_other: ['Hangar_Query_2'],
};

const storedRecord = {
  roles: ['Director', 'Accountant'],
  rolesAtHq: ['Hangar_Query_1'],
  rolesAtBase: [],
  rolesAtOther: ['Hangar_Query_2'],
};

beforeEach(() => {
  mocks.fetchAffiliations.mockReset().mockResolvedValue({
    rows: [{ characterId: 9001, corporationId: 98001, allianceId: null, factionId: null }],
    transientFailure: false,
  });
  mocks.readEsiAuthed.mockReset();
  mocks.upsertCorpRoles.mockReset().mockResolvedValue(true);
  mocks.readRoleCorporationId.mockReset().mockResolvedValue(98001);
  mocks.getFreshAccessTokenForCharacter.mockReset();
});

describe('probeAndStoreRoles', () => {
  it('stores all four role arrays and returns the global list the credential probe selects by', async () => {
    mocks.readEsiAuthed.mockResolvedValue({ kind: 'fresh', body: fullBody, etag: null, expiresAt: null });

    await expect(probeAndStoreRoles(9001, 'access-token')).resolves.toEqual(['Director', 'Accountant']);
    expect(mocks.readEsiAuthed).toHaveBeenCalledWith('/characters/9001/roles', 'access-token', null);
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date), 98001);
    expect(mocks.fetchAffiliations).toHaveBeenCalledTimes(2);
    expect(mocks.fetchAffiliations).toHaveBeenCalledWith([9001]);
  });

  it('stores nothing and returns null for a body that is not a roles record', async () => {
    mocks.readEsiAuthed.mockResolvedValue({
      kind: 'fresh',
      body: { roles: ['Director', 42] },
      etag: null,
      expiresAt: null,
    });

    await expect(probeAndStoreRoles(9001, 'access-token')).resolves.toBeNull();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('returns null for soft ESI failures but preserves budget deferrals', async () => {
    mocks.readEsiAuthed.mockResolvedValueOnce({ kind: 'error', code: 'esi_403' });
    await expect(probeAndStoreRoles(9001, 'access-token')).resolves.toBeNull();

    mocks.readEsiAuthed.mockRejectedValueOnce(new EsiBudgetExhaustedError(19));
    await expect(probeAndStoreRoles(9001, 'access-token')).rejects.toBeInstanceOf(EsiBudgetExhaustedError);

    mocks.readEsiAuthed.mockRejectedValueOnce(new EsiServerError(503));
    await expect(probeAndStoreRoles(9001, 'access-token')).resolves.toBeNull();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('rejects another corporation before the ESI roles read', async () => {
    await expect(probeAndStoreRoles(9001, 'access-token', 98002)).resolves.toBeNull();
    expect(mocks.readEsiAuthed).not.toHaveBeenCalled();
    expect(mocks.fetchAffiliations).not.toHaveBeenCalled();
  });

  it('rejects live membership in B while cached membership and the requested corporation still say A', async () => {
    mocks.fetchAffiliations.mockResolvedValue({
      rows: [{ characterId: 9001, corporationId: 98002, allianceId: null, factionId: null }],
      transientFailure: false,
    });
    mocks.readEsiAuthed.mockResolvedValue({ kind: 'fresh', body: fullBody });

    await expect(probeAndStoreRoles(9001, 'access-token', 98001)).resolves.toBeNull();
    expect(mocks.readEsiAuthed).not.toHaveBeenCalled();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('rejects a live corporation transfer during the roles request even if the database still says A', async () => {
    mocks.fetchAffiliations.mockResolvedValueOnce({
      rows: [{ characterId: 9001, corporationId: 98001 }], transientFailure: false,
    }).mockResolvedValueOnce({
      rows: [{ characterId: 9001, corporationId: 98002 }], transientFailure: false,
    });
    mocks.readEsiAuthed.mockResolvedValue({ kind: 'fresh', body: fullBody });

    await expect(probeAndStoreRoles(9001, 'access-token', 98001)).resolves.toBeNull();
    expect(mocks.readEsiAuthed).toHaveBeenCalledOnce();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it.each([
    { rows: [], transientFailure: true },
    { rows: [], transientFailure: false },
    { rows: [{ characterId: 9001, corporationId: null }], transientFailure: false },
    { rows: [{ characterId: 9002, corporationId: 98001 }], transientFailure: false },
    { rows: [{ characterId: 9001, corporationId: 98001 }], transientFailure: true },
  ])('fails closed when the live affiliation cannot be verified: %j', async (result) => {
    mocks.fetchAffiliations.mockResolvedValue(result);

    await expect(probeAndStoreRoles(9001, 'access-token', 98001)).resolves.toBeNull();
    expect(mocks.readEsiAuthed).not.toHaveBeenCalled();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('does not publish roles if the affiliation verification after the roles read fails', async () => {
    mocks.fetchAffiliations.mockResolvedValueOnce({
      rows: [{ characterId: 9001, corporationId: 98001 }], transientFailure: false,
    }).mockResolvedValueOnce({ rows: [], transientFailure: true });
    mocks.readEsiAuthed.mockResolvedValue({ kind: 'fresh', body: fullBody });

    await expect(probeAndStoreRoles(9001, 'access-token', 98001)).resolves.toBeNull();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('rejects a corporation change during a bound roles read', async () => {
    mocks.readEsiAuthed.mockResolvedValue({ kind: 'fresh', body: fullBody, etag: null, expiresAt: null });
    mocks.upsertCorpRoles.mockResolvedValue(false);
    await expect(probeAndStoreRoles(9001, 'access-token', 98001)).resolves.toBeNull();
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date), 98001);
  });

  it('does not hide an unexpected failure', async () => {
    const failure = new Error('unexpected');
    mocks.readEsiAuthed.mockRejectedValue(failure);

    await expect(probeAndStoreRoles(9001, 'access-token')).rejects.toBe(failure);
  });
});

describe('fetchAndStoreCorpRoles', () => {
  it('does not bind newly fetched roles to stale local membership', async () => {
    mocks.getFreshAccessTokenForCharacter.mockResolvedValue({ kind: 'ok', accessToken: 'vended', expiresAt: 1 });
    mocks.fetchAffiliations.mockResolvedValue({
      rows: [{ characterId: 9001, corporationId: 98002 }], transientFailure: false,
    });

    await expect(fetchAndStoreCorpRoles(9001)).resolves.toBeNull();
    expect(mocks.readEsiAuthed).not.toHaveBeenCalled();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });
  it('vends the token itself and returns the full record it stored', async () => {
    mocks.getFreshAccessTokenForCharacter.mockResolvedValue({ kind: 'ok', accessToken: 'vended', expiresAt: 1 });
    mocks.readEsiAuthed.mockResolvedValue({ kind: 'fresh', body: fullBody, etag: null, expiresAt: null });

    await expect(fetchAndStoreCorpRoles(9001)).resolves.toEqual({ ...storedRecord, characterId: 9001, corporationId: 98001, fetchedAt: expect.any(Date) });
    expect(mocks.readEsiAuthed).toHaveBeenCalledWith('/characters/9001/roles', 'vended', null);
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date), 98001);
  });

  it('does not return roles when the affiliation changed while ESI was in flight', async () => {
    mocks.getFreshAccessTokenForCharacter.mockResolvedValue({ kind: 'ok', accessToken: 'vended', expiresAt: 1 });
    mocks.readEsiAuthed.mockResolvedValue({ kind: 'fresh', body: fullBody, etag: null, expiresAt: null });
    mocks.upsertCorpRoles.mockResolvedValue(false);

    await expect(fetchAndStoreCorpRoles(9001)).resolves.toBeNull();
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date), 98001);
  });

  it('does not query roles without a known corporation', async () => {
    mocks.readRoleCorporationId.mockResolvedValue(null);
    await expect(probeAndStoreRoles(9001, 'access-token')).resolves.toBeNull();
    expect(mocks.readEsiAuthed).not.toHaveBeenCalled();
  });

  it('returns null without an ESI call when no token can be vended', async () => {
    mocks.getFreshAccessTokenForCharacter.mockResolvedValue({ kind: 'reauth_required' });

    await expect(fetchAndStoreCorpRoles(9001)).resolves.toBeNull();
    expect(mocks.readEsiAuthed).not.toHaveBeenCalled();
  });
});
