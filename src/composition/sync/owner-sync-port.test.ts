import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EsiResponseMeta, EsiStoreKey, StoredAuthedRead } from '@/data/esi-store';
import type { StoredCorpRoles } from '@/platform/auth/corp-roles-store';
import type { FreshTokenResult } from '@/platform/auth/eve-token-service';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';

const mocks = vi.hoisted(() => ({
  fetchAffiliations: vi.fn(),
  isDue: vi.fn<(keys: unknown) => Promise<boolean>>(async () => true),
  readStoredAuthed: vi.fn(),
  commit: vi.fn<(metas: unknown, opts: unknown) => Promise<void>>(async () => {}),
  upsertCorpRoles: vi.fn(async () => true),
  readRoleCorporationId: vi.fn(async (): Promise<number | null> => 98001),
  readCorpRoles: vi.fn(async (): Promise<Map<number, StoredCorpRoles>> => new Map()),
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
  readCorpRoles: mocks.readCorpRoles,
}));

vi.mock('@/data/esi-store', () => ({
  isDue: (keys: unknown) => mocks.isDue(keys),
  readStoredAuthed: (key: unknown, accessToken: unknown, init: unknown) => mocks.readStoredAuthed(key, accessToken, init),
  commit: (metas: unknown, opts: unknown) => mocks.commit(metas, opts),
  datasetTag: () => 'eve:character_corp_roles:character:9001',
}));

import {
  fetchAndStoreCorpRoles,
  probeAndStoreRoles,
  readRolesForSync,
  usableStoredRoles,
  vendTokenFor,
} from './owner-sync-port';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const ROLES_KEY: EsiStoreKey = { route: '/characters/{character_id}/roles/', holder: { kind: 'character', id: 9001 } };

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

const meta: EsiResponseMeta = { key: ROLES_KEY, expiresAt: NOW + 3_600_000, etags: ['"r1"'], lastModified: null, checkedAt: NOW };

function freshRead(): StoredAuthedRead {
  return { kind: 'fresh', body: fullBody, etag: '"r1"', meta };
}

function storedRoles(overrides: Partial<StoredCorpRoles> = {}): StoredCorpRoles {
  return {
    roles: ['Accountant'],
    rolesAtHq: [],
    rolesAtBase: [],
    rolesAtOther: [],
    characterId: 9001,
    corporationId: 98001,
    fetchedAt: new Date(NOW - 60_000),
    expiresAt: new Date(NOW + 3_000_000),
    ...overrides,
  };
}

function holdStored(row: StoredCorpRoles): void {
  mocks.readCorpRoles.mockResolvedValue(new Map([[row.characterId, row]]));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.fetchAffiliations.mockReset().mockResolvedValue({
    rows: [{ characterId: 9001, corporationId: 98001, allianceId: null, factionId: null }],
    transientFailure: false,
    answers: [],
  });
  mocks.isDue.mockReset().mockResolvedValue(true);
  mocks.readStoredAuthed.mockReset();
  mocks.commit.mockReset().mockResolvedValue(undefined);
  mocks.upsertCorpRoles.mockReset().mockResolvedValue(true);
  mocks.readRoleCorporationId.mockReset().mockResolvedValue(98001);
  mocks.readCorpRoles.mockReset().mockResolvedValue(new Map());
  mocks.getFreshAccessTokenForCharacter.mockReset();
});

describe('usableStoredRoles', () => {
  it('trusts a same-corporation row until the expiry CCP gave its answer', () => {
    const now = new Date(NOW);
    expect(usableStoredRoles(storedRoles(), 98001, now)).toBe(true);
    expect(usableStoredRoles(storedRoles({ expiresAt: new Date(NOW) }), 98001, now)).toBe(false);
    expect(usableStoredRoles(storedRoles({ expiresAt: null }), 98001, now)).toBe(false);
    expect(usableStoredRoles(storedRoles({ corporationId: 98002 }), 98001, now)).toBe(false);
    expect(usableStoredRoles(undefined, 98001, now)).toBe(false);
  });
});

describe('probeAndStoreRoles', () => {
  it('asks ESI live past the stored expiry, stores all four role arrays, commits the meta and returns the global list', async () => {
    mocks.readStoredAuthed.mockResolvedValue(freshRead());

    await expect(probeAndStoreRoles(9001, 'access-token')).resolves.toEqual(['Director', 'Accountant']);
    expect(mocks.isDue).not.toHaveBeenCalled();
    expect(mocks.readStoredAuthed).toHaveBeenCalledWith(ROLES_KEY, 'access-token', { live: true });
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date), 98001);
    expect(mocks.commit).toHaveBeenCalledWith([meta], { tag: 'eve:character_corp_roles:character:9001' });
    expect(mocks.commit.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.upsertCorpRoles.mock.invocationCallOrder[0]!);
    expect(mocks.fetchAffiliations).toHaveBeenCalledTimes(2);
    expect(mocks.fetchAffiliations).toHaveBeenCalledWith([9001]);
  });

  it('reuses the stored row when the live call answers 304', async () => {
    holdStored(storedRoles());
    mocks.readStoredAuthed.mockResolvedValue({ kind: 'unchanged', expiresAt: NOW + 3_600_000 });

    await expect(probeAndStoreRoles(9001, 'access-token', 98001)).resolves.toEqual(['Accountant']);
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('stores nothing and returns null for a body that is not a roles record', async () => {
    mocks.readStoredAuthed.mockResolvedValue({ ...freshRead(), body: { roles: ['Director', 42] } });

    await expect(probeAndStoreRoles(9001, 'access-token')).resolves.toBeNull();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('returns null for soft ESI failures but preserves budget deferrals', async () => {
    mocks.readStoredAuthed.mockResolvedValueOnce({ kind: 'error', code: 'esi_403' });
    await expect(probeAndStoreRoles(9001, 'access-token')).resolves.toBeNull();

    mocks.readStoredAuthed.mockRejectedValueOnce(new EsiBudgetExhaustedError(19));
    await expect(probeAndStoreRoles(9001, 'access-token')).rejects.toBeInstanceOf(EsiBudgetExhaustedError);

    mocks.readStoredAuthed.mockRejectedValueOnce(new EsiServerError(503));
    await expect(probeAndStoreRoles(9001, 'access-token')).resolves.toBeNull();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('rejects another corporation before the ESI roles read', async () => {
    await expect(probeAndStoreRoles(9001, 'access-token', 98002)).resolves.toBeNull();
    expect(mocks.readStoredAuthed).not.toHaveBeenCalled();
    expect(mocks.fetchAffiliations).not.toHaveBeenCalled();
  });

  it('rejects live membership in B while cached membership and the requested corporation still say A', async () => {
    mocks.fetchAffiliations.mockResolvedValue({
      rows: [{ characterId: 9001, corporationId: 98002, allianceId: null, factionId: null }],
      transientFailure: false,
      answers: [],
    });
    mocks.readStoredAuthed.mockResolvedValue(freshRead());

    await expect(probeAndStoreRoles(9001, 'access-token', 98001)).resolves.toBeNull();
    expect(mocks.readStoredAuthed).not.toHaveBeenCalled();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('rejects a live corporation transfer during the roles request even if the database still says A', async () => {
    mocks.fetchAffiliations.mockResolvedValueOnce({
      rows: [{ characterId: 9001, corporationId: 98001 }], transientFailure: false, answers: [],
    }).mockResolvedValueOnce({
      rows: [{ characterId: 9001, corporationId: 98002 }], transientFailure: false, answers: [],
    });
    mocks.readStoredAuthed.mockResolvedValue(freshRead());

    await expect(probeAndStoreRoles(9001, 'access-token', 98001)).resolves.toBeNull();
    expect(mocks.readStoredAuthed).toHaveBeenCalledOnce();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it.each([
    { rows: [], transientFailure: true },
    { rows: [], transientFailure: false },
    { rows: [{ characterId: 9001, corporationId: null }], transientFailure: false },
    { rows: [{ characterId: 9002, corporationId: 98001 }], transientFailure: false },
    { rows: [{ characterId: 9001, corporationId: 98001 }], transientFailure: true },
  ])('fails closed when the live affiliation cannot be verified: %j', async (result) => {
    mocks.fetchAffiliations.mockResolvedValue({ ...result, answers: [] });

    await expect(probeAndStoreRoles(9001, 'access-token', 98001)).resolves.toBeNull();
    expect(mocks.readStoredAuthed).not.toHaveBeenCalled();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('does not publish roles if the affiliation verification after the roles read fails', async () => {
    mocks.fetchAffiliations.mockResolvedValueOnce({
      rows: [{ characterId: 9001, corporationId: 98001 }], transientFailure: false, answers: [],
    }).mockResolvedValueOnce({ rows: [], transientFailure: true, answers: [] });
    mocks.readStoredAuthed.mockResolvedValue(freshRead());

    await expect(probeAndStoreRoles(9001, 'access-token', 98001)).resolves.toBeNull();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('rejects a corporation change during a bound roles read and records no expiry for roles it did not store', async () => {
    mocks.readStoredAuthed.mockResolvedValue(freshRead());
    mocks.upsertCorpRoles.mockResolvedValue(false);
    await expect(probeAndStoreRoles(9001, 'access-token', 98001)).resolves.toBeNull();
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date), 98001);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('does not hide an unexpected failure', async () => {
    const failure = new Error('unexpected');
    mocks.readStoredAuthed.mockRejectedValue(failure);

    await expect(probeAndStoreRoles(9001, 'access-token')).rejects.toBe(failure);
  });
});

describe('readRolesForSync', () => {
  it('returns same-corporation stored roles without asking ESI while the stored answer is unexpired', async () => {
    holdStored(storedRoles());
    mocks.isDue.mockResolvedValue(false);

    await expect(readRolesForSync(9001, 'access-token')).resolves.toEqual(['Accountant']);
    expect(mocks.isDue).toHaveBeenCalledExactlyOnceWith([ROLES_KEY]);
    expect(mocks.readCorpRoles).toHaveBeenCalledExactlyOnceWith([9001]);
    expect(mocks.fetchAffiliations).not.toHaveBeenCalled();
    expect(mocks.readStoredAuthed).not.toHaveBeenCalled();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('returns null for an unexpired row stored for another corporation', async () => {
    holdStored(storedRoles({ corporationId: 98002 }));
    mocks.isDue.mockResolvedValue(false);

    await expect(readRolesForSync(9001, 'access-token')).resolves.toBeNull();
    expect(mocks.readStoredAuthed).not.toHaveBeenCalled();
  });

  it('probes ESI with the held ETag once the stored answer has expired and stores a 200', async () => {
    mocks.readStoredAuthed.mockResolvedValue(freshRead());

    await expect(readRolesForSync(9001, 'access-token')).resolves.toEqual(['Director', 'Accountant']);
    expect(mocks.readStoredAuthed).toHaveBeenCalledWith(ROLES_KEY, 'access-token', {});
    expect(mocks.fetchAffiliations).toHaveBeenCalledTimes(2);
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date), 98001);
    expect(mocks.commit).toHaveBeenCalledOnce();
  });

  it('keeps the stored row on a 304 past the expiry', async () => {
    holdStored(storedRoles({ expiresAt: new Date(NOW - 1) }));
    mocks.readStoredAuthed.mockResolvedValue({ kind: 'unchanged', expiresAt: NOW + 3_600_000 });

    await expect(readRolesForSync(9001, 'access-token')).resolves.toEqual(['Accountant']);
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('returns null without reading stored roles when the character has no known corporation', async () => {
    mocks.readRoleCorporationId.mockResolvedValue(null);
    holdStored(storedRoles());

    await expect(readRolesForSync(9001, 'access-token')).resolves.toBeNull();
    expect(mocks.readCorpRoles).not.toHaveBeenCalled();
    expect(mocks.readStoredAuthed).not.toHaveBeenCalled();
  });

  it('still defers for the ESI budget when it falls back to the live probe', async () => {
    const budget = new EsiBudgetExhaustedError(19);
    mocks.readStoredAuthed.mockRejectedValue(budget);

    await expect(readRolesForSync(9001, 'access-token')).rejects.toBe(budget);
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('leaves the mutation gates on the live probe while the viewer fallback follows the store', async () => {
    holdStored(storedRoles());
    mocks.isDue.mockResolvedValue(false);
    mocks.getFreshAccessTokenForCharacter.mockResolvedValue({ kind: 'ok', accessToken: 'vended', expiresAt: 1 });
    mocks.readStoredAuthed.mockResolvedValue(freshRead());

    await expect(probeAndStoreRoles(9001, 'access-token', 98001)).resolves.toEqual(['Director', 'Accountant']);
    await expect(fetchAndStoreCorpRoles(9001)).resolves.toMatchObject({ roles: ['Accountant'] });
    expect(mocks.readStoredAuthed).toHaveBeenCalledExactlyOnceWith(ROLES_KEY, 'access-token', { live: true });
  });
});

describe('vendTokenFor', () => {
  it('shares one token-service call between concurrent vends of a character and asks again once it settles', async () => {
    const vend = Promise.withResolvers<FreshTokenResult>();
    mocks.getFreshAccessTokenForCharacter.mockReturnValueOnce(vend.promise);

    const first = vendTokenFor(7);
    const second = vendTokenFor(7);
    expect(mocks.getFreshAccessTokenForCharacter).toHaveBeenCalledExactlyOnceWith(7);
    vend.resolve({ kind: 'ok', accessToken: 'vended', expiresAt: 1 });
    await expect(Promise.all([first, second])).resolves.toEqual(['vended', 'vended']);

    mocks.getFreshAccessTokenForCharacter.mockResolvedValueOnce({ kind: 'reauth_required' });
    await expect(Promise.all([vendTokenFor(7), vendTokenFor(7)])).resolves.toEqual([null, null]);
    expect(mocks.getFreshAccessTokenForCharacter).toHaveBeenCalledTimes(2);
  });
});

describe('fetchAndStoreCorpRoles', () => {
  it('does not bind newly fetched roles to stale local membership', async () => {
    mocks.getFreshAccessTokenForCharacter.mockResolvedValue({ kind: 'ok', accessToken: 'vended', expiresAt: 1 });
    mocks.fetchAffiliations.mockResolvedValue({
      rows: [{ characterId: 9001, corporationId: 98002 }], transientFailure: false, answers: [],
    });

    await expect(fetchAndStoreCorpRoles(9001)).resolves.toBeNull();
    expect(mocks.readStoredAuthed).not.toHaveBeenCalled();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('vends the token itself and returns the full record it stored, with the expiry it committed', async () => {
    mocks.getFreshAccessTokenForCharacter.mockResolvedValue({ kind: 'ok', accessToken: 'vended', expiresAt: 1 });
    mocks.readStoredAuthed.mockResolvedValue(freshRead());

    await expect(fetchAndStoreCorpRoles(9001)).resolves.toEqual({
      ...storedRecord,
      characterId: 9001,
      corporationId: 98001,
      fetchedAt: expect.any(Date),
      expiresAt: new Date(NOW + 3_600_000),
    });
    expect(mocks.readStoredAuthed).toHaveBeenCalledWith(ROLES_KEY, 'vended', {});
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date), 98001);
  });

  it('does not return roles when the affiliation changed while ESI was in flight', async () => {
    mocks.getFreshAccessTokenForCharacter.mockResolvedValue({ kind: 'ok', accessToken: 'vended', expiresAt: 1 });
    mocks.readStoredAuthed.mockResolvedValue(freshRead());
    mocks.upsertCorpRoles.mockResolvedValue(false);

    await expect(fetchAndStoreCorpRoles(9001)).resolves.toBeNull();
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date), 98001);
  });

  it('does not query roles without a known corporation', async () => {
    mocks.readRoleCorporationId.mockResolvedValue(null);
    await expect(probeAndStoreRoles(9001, 'access-token')).resolves.toBeNull();
    expect(mocks.readStoredAuthed).not.toHaveBeenCalled();
  });

  it('returns null without an ESI call when no token can be vended', async () => {
    mocks.getFreshAccessTokenForCharacter.mockResolvedValue({ kind: 'reauth_required' });

    await expect(fetchAndStoreCorpRoles(9001)).resolves.toBeNull();
    expect(mocks.readStoredAuthed).not.toHaveBeenCalled();
  });
});
