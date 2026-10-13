import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EsiResponseMeta, EsiStoreKey, StoredAuthedRead } from '@/data/esi-store';
import type { StoredCorpRoles } from '@/platform/auth/corp-roles-store';
import type { FreshTokenResult } from '@/platform/auth/eve-token-service';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';

const mocks = vi.hoisted(() => ({
  fetchAffiliations: vi.fn(),
  isDue: vi.fn<(keys: unknown) => Promise<boolean>>(async () => true),
  readStoredAuthed: vi.fn(),
  recordMetas: vi.fn<(metas: unknown) => Promise<void>>(async () => {}),
  upsertCorpRoles: vi.fn(async () => true),
  readRoleCorporationId: vi.fn(async (_characterId: number): Promise<number | null> => 98001),
  readCorpRoles: vi.fn(async (_ids: number[]): Promise<Map<number, StoredCorpRoles>> => new Map()),
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
  recordMetas: (metas: unknown) => mocks.recordMetas(metas),
}));

import {
  fetchCorpRolesForMembers,
  probeAndStoreRoles,
  readRolesForSync,
  usableStoredRoles,
  vendedToken,
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
  mocks.recordMetas.mockReset().mockResolvedValue(undefined);
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
  it('asks ESI live past the stored expiry, stores all four role arrays, records the meta with no tag clear and returns the global list', async () => {
    mocks.readStoredAuthed.mockResolvedValue(freshRead());

    await expect(probeAndStoreRoles(9001, 'access-token')).resolves.toEqual(['Director', 'Accountant']);
    expect(mocks.isDue).not.toHaveBeenCalled();
    // No stored row is bound to the corporation, so the read sends no ETag.
    expect(mocks.readStoredAuthed).toHaveBeenCalledWith(ROLES_KEY, 'access-token', { live: true, interactive: true, conditional: false });
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date), 98001);
    expect(mocks.recordMetas).toHaveBeenCalledWith([meta]);
    expect(mocks.recordMetas.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.upsertCorpRoles.mock.invocationCallOrder[0]!);
    expect(mocks.fetchAffiliations).toHaveBeenCalledTimes(2);
    // A mutation gate's user waits on both live affiliation checks.
    expect(mocks.fetchAffiliations.mock.calls).toEqual([[[9001], { interactive: true }], [[9001], { interactive: true }]]);
  });

  it('reuses the stored row when the live call answers 304', async () => {
    holdStored(storedRoles());
    mocks.readStoredAuthed.mockResolvedValue({ kind: 'unchanged', expiresAt: NOW + 3_600_000 });

    await expect(probeAndStoreRoles(9001, 'access-token', 98001)).resolves.toEqual(['Accountant']);
    expect(mocks.readStoredAuthed).toHaveBeenCalledWith(ROLES_KEY, 'access-token', { live: true, interactive: true });
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
    expect(mocks.recordMetas).not.toHaveBeenCalled();
  });

  it('reads without the held ETag and rebinds the row when the stored roles belong to the corporation the character left', async () => {
    holdStored(storedRoles({ corporationId: 98001 }));
    mocks.readRoleCorporationId.mockResolvedValue(98002);
    mocks.fetchAffiliations.mockResolvedValue({
      rows: [{ characterId: 9001, corporationId: 98002, allianceId: null, factionId: null }],
      transientFailure: false,
      answers: [],
    });
    mocks.readStoredAuthed.mockResolvedValue(freshRead());

    await expect(probeAndStoreRoles(9001, 'access-token', 98002)).resolves.toEqual(['Director', 'Accountant']);
    expect(mocks.readStoredAuthed).toHaveBeenCalledWith(ROLES_KEY, 'access-token', { live: true, interactive: true, conditional: false });
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date), 98002);
    expect(mocks.recordMetas).toHaveBeenCalledWith([meta]);
  });

  it('stores nothing and returns null for a body that is not a roles record', async () => {
    mocks.readStoredAuthed.mockResolvedValue({ ...freshRead(), body: { roles: ['Director', 42] } });

    await expect(probeAndStoreRoles(9001, 'access-token')).resolves.toBeNull();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
    expect(mocks.recordMetas).not.toHaveBeenCalled();
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
    expect(mocks.recordMetas).not.toHaveBeenCalled();
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
    expect(mocks.recordMetas).not.toHaveBeenCalled();
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

  it('probes ESI without an ETag once the stored answer has expired and no row is stored, and stores a 200', async () => {
    mocks.readStoredAuthed.mockResolvedValue(freshRead());

    await expect(readRolesForSync(9001, 'access-token')).resolves.toEqual(['Director', 'Accountant']);
    expect(mocks.readStoredAuthed).toHaveBeenCalledWith(ROLES_KEY, 'access-token', { conditional: false });
    expect(mocks.fetchAffiliations).toHaveBeenCalledTimes(2);
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date), 98001);
    expect(mocks.recordMetas).toHaveBeenCalledOnce();
  });

  it('keeps the stored row on a 304 past the expiry, having sent the held ETag for a row bound to this corporation', async () => {
    holdStored(storedRoles({ expiresAt: new Date(NOW - 1) }));
    mocks.readStoredAuthed.mockResolvedValue({ kind: 'unchanged', expiresAt: NOW + 3_600_000 });

    await expect(readRolesForSync(9001, 'access-token')).resolves.toEqual(['Accountant']);
    expect(mocks.readStoredAuthed).toHaveBeenCalledWith(ROLES_KEY, 'access-token', {});
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('reads unconditionally after a corporation transfer with the same roles, so the 200 rebinds the row instead of a 304 keeping the old one', async () => {
    holdStored(storedRoles({ corporationId: 98001, expiresAt: new Date(NOW - 1) }));
    mocks.readRoleCorporationId.mockResolvedValue(98002);
    mocks.fetchAffiliations.mockResolvedValue({
      rows: [{ characterId: 9001, corporationId: 98002, allianceId: null, factionId: null }],
      transientFailure: false,
      answers: [],
    });
    mocks.readStoredAuthed.mockResolvedValue(freshRead());

    await expect(readRolesForSync(9001, 'access-token')).resolves.toEqual(['Director', 'Accountant']);
    expect(mocks.readStoredAuthed).toHaveBeenCalledWith(ROLES_KEY, 'access-token', { conditional: false });
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date), 98002);
    expect(mocks.recordMetas).toHaveBeenCalledWith([meta]);
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
    expect((await fetchCorpRolesForMembers([9001])).get(9001)).toMatchObject({ status: 'fulfilled', value: { roles: ['Accountant'] } });
    expect(mocks.readStoredAuthed).toHaveBeenCalledExactlyOnceWith(ROLES_KEY, 'access-token', { live: true, interactive: true });
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
    await expect(Promise.all([vendTokenFor(7), vendTokenFor(7)])).resolves.toEqual([{ missing: 'lost' }, { missing: 'lost' }]);
    expect(mocks.getFreshAccessTokenForCharacter).toHaveBeenCalledTimes(2);
  });

  it('tells a grant that is gone from a token service failing for now', () => {
    expect(vendedToken({ kind: 'ok', accessToken: 'vended', expiresAt: 1 })).toBe('vended');
    expect(vendedToken({ kind: 'not_found' })).toEqual({ missing: 'lost' });
    expect(vendedToken({ kind: 'reauth_required' })).toEqual({ missing: 'lost' });
    expect(vendedToken({ kind: 'upstream_error' })).toEqual({ missing: 'unavailable' });
  });
});

describe('fetchCorpRolesForMembers', () => {
  const MEMBERS = [9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008];

  function rolesKey(characterId: number): EsiStoreKey {
    return { route: '/characters/{character_id}/roles/', holder: { kind: 'character', id: characterId } };
  }

  function idOf(key: EsiStoreKey): number {
    return (key.holder as { id: number }).id;
  }

  function freshFor(characterId: number): StoredAuthedRead {
    return { kind: 'fresh', body: fullBody, etag: '"r1"', meta: { ...meta, key: rolesKey(characterId) } };
  }

  /** Each live affiliation POST answers every id it was sent with the corporation `corporationOf` names. */
  function liveCorporations(corporationOf: (characterId: number) => number = () => 98001): void {
    mocks.fetchAffiliations.mockImplementation(async (ids: number[]) => ({
      rows: ids.map((characterId) => ({ characterId, corporationId: corporationOf(characterId), allianceId: null, factionId: null })),
      transientFailure: false,
      answers: [],
    }));
  }

  function reads(readFor: (characterId: number) => StoredAuthedRead | Promise<StoredAuthedRead>): void {
    mocks.readStoredAuthed.mockImplementation(async (key: EsiStoreKey) => readFor(idOf(key)));
  }

  function storeRows(rows: readonly StoredCorpRoles[]): void {
    mocks.readCorpRoles.mockImplementation(async (ids: number[]) =>
      new Map(rows.filter((row) => ids.includes(row.characterId)).map((row) => [row.characterId, row])));
  }

  function affiliationCalls(): unknown[][] {
    return mocks.fetchAffiliations.mock.calls.map(([ids]) => ids as unknown[]);
  }

  beforeEach(() => {
    mocks.getFreshAccessTokenForCharacter.mockResolvedValue({ kind: 'ok', accessToken: 'vended', expiresAt: 1 });
    liveCorporations();
    reads(freshFor);
  });

  it('checks every due member\'s live corporation in one POST before the reads and one after, and stores each 200', async () => {
    const outcomes = await fetchCorpRolesForMembers(MEMBERS);

    expect(mocks.fetchAffiliations.mock.calls).toEqual([[MEMBERS, undefined], [MEMBERS, undefined]]);
    expect(mocks.fetchAffiliations.mock.invocationCallOrder[0]).toBeLessThan(mocks.readStoredAuthed.mock.invocationCallOrder[0]!);
    expect(mocks.fetchAffiliations.mock.invocationCallOrder[1]).toBeGreaterThan(mocks.readStoredAuthed.mock.invocationCallOrder.at(-1)!);
    expect(mocks.readStoredAuthed).toHaveBeenCalledTimes(8);
    expect(mocks.readStoredAuthed).toHaveBeenCalledWith(rolesKey(9001), 'vended', { conditional: false });
    expect(mocks.upsertCorpRoles).toHaveBeenCalledTimes(8);
    expect(mocks.recordMetas).toHaveBeenCalledTimes(8);
    expect([...outcomes.keys()].sort()).toEqual(MEMBERS);
    expect(outcomes.get(9005)).toEqual({
      status: 'fulfilled',
      value: { ...storedRecord, characterId: 9005, corporationId: 98001, fetchedAt: expect.any(Date), expiresAt: new Date(NOW + 3_600_000) },
    });
  });

  it('leaves a 304 out of the check after the reads and keeps its stored row', async () => {
    const kept = storedRoles({ characterId: 9002, expiresAt: new Date(NOW - 1) });
    storeRows([kept]);
    reads((characterId) => characterId === 9002 ? { kind: 'unchanged', expiresAt: NOW + 3_600_000 } : freshFor(characterId));

    const outcomes = await fetchCorpRolesForMembers([9001, 9002, 9003]);

    expect(affiliationCalls()).toEqual([[9001, 9002, 9003], [9001, 9003]]);
    // The row bound to this corporation lets the read carry the held ETag.
    expect(mocks.readStoredAuthed).toHaveBeenCalledWith(rolesKey(9002), 'vended', {});
    expect(outcomes.get(9002)).toEqual({ status: 'fulfilled', value: kept });
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalledWith(9002, expect.anything(), expect.anything(), expect.anything());
  });

  it('reads nothing for a member the check before the reads finds in another corporation', async () => {
    liveCorporations((characterId) => characterId === 9003 ? 98002 : 98001);

    const outcomes = await fetchCorpRolesForMembers([9001, 9003]);

    expect(mocks.readStoredAuthed).toHaveBeenCalledExactlyOnceWith(rolesKey(9001), 'vended', { conditional: false });
    expect(affiliationCalls()).toEqual([[9001, 9003], [9001]]);
    expect(outcomes.get(9003)).toEqual({ status: 'fulfilled', value: null });
    expect(outcomes.get(9001)).toMatchObject({ status: 'fulfilled', value: { characterId: 9001 } });
  });

  it('stores nothing for a member the check after the reads finds in another corporation', async () => {
    let call = 0;
    mocks.fetchAffiliations.mockImplementation(async (ids: number[]) => {
      call += 1;
      return {
        rows: ids.map((characterId) => ({ characterId, corporationId: call === 2 && characterId === 9004 ? 98002 : 98001 })),
        transientFailure: false,
        answers: [],
      };
    });

    const outcomes = await fetchCorpRolesForMembers([9001, 9004]);

    expect(outcomes.get(9004)).toEqual({ status: 'fulfilled', value: null });
    expect(mocks.upsertCorpRoles).toHaveBeenCalledExactlyOnceWith(9001, storedRecord, expect.any(Date), 98001);
    expect(mocks.recordMetas).toHaveBeenCalledExactlyOnceWith([{ ...meta, key: rolesKey(9001) }]);
  });

  it('settles every member null and commits nothing when the check before the reads is transient', async () => {
    mocks.fetchAffiliations.mockResolvedValue({ rows: [], transientFailure: true, answers: [] });

    const outcomes = await fetchCorpRolesForMembers([9001, 9002]);

    expect(mocks.fetchAffiliations).toHaveBeenCalledOnce();
    expect(mocks.readStoredAuthed).not.toHaveBeenCalled();
    expect([...outcomes.values()]).toEqual([{ status: 'fulfilled', value: null }, { status: 'fulfilled', value: null }]);
  });

  it('settles every 200 null and commits nothing when the check after the reads is transient', async () => {
    mocks.fetchAffiliations
      .mockResolvedValueOnce({ rows: [{ characterId: 9001, corporationId: 98001 }, { characterId: 9002, corporationId: 98001 }], transientFailure: false, answers: [] })
      .mockResolvedValueOnce({ rows: [{ characterId: 9001, corporationId: 98001 }], transientFailure: true, answers: [] });

    const outcomes = await fetchCorpRolesForMembers([9001, 9002]);

    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
    expect(mocks.recordMetas).not.toHaveBeenCalled();
    expect([...outcomes.values()]).toEqual([{ status: 'fulfilled', value: null }, { status: 'fulfilled', value: null }]);
  });

  it('settles every member it guards with the budget deferral when a shared check throws it', async () => {
    const budget = new EsiBudgetExhaustedError(19);
    mocks.fetchAffiliations.mockRejectedValueOnce(budget);

    const outcomes = await fetchCorpRolesForMembers([9001, 9002]);

    expect(mocks.readStoredAuthed).not.toHaveBeenCalled();
    expect([...outcomes.values()]).toEqual([{ status: 'rejected', reason: budget }, { status: 'rejected', reason: budget }]);

    mocks.fetchAffiliations.mockClear();
    liveCorporations();
    mocks.fetchAffiliations.mockImplementationOnce(async (ids: number[]) => ({
      rows: ids.map((characterId) => ({ characterId, corporationId: 98001 })), transientFailure: false, answers: [],
    })).mockRejectedValueOnce(budget);
    const after = await fetchCorpRolesForMembers([9001]);
    expect(after.get(9001)).toEqual({ status: 'rejected', reason: budget });
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('keeps one member\'s read failure to that member', async () => {
    const budget = new EsiBudgetExhaustedError(19);
    reads((characterId) => {
      if (characterId === 9001) throw budget;
      if (characterId === 9002) throw new EsiServerError(503);
      if (characterId === 9003) return { kind: 'error', code: 'esi_403' };
      return freshFor(characterId);
    });

    const outcomes = await fetchCorpRolesForMembers([9001, 9002, 9003, 9004]);

    expect(outcomes.get(9001)).toEqual({ status: 'rejected', reason: budget });
    expect(outcomes.get(9002)).toEqual({ status: 'fulfilled', value: null });
    expect(outcomes.get(9003)).toEqual({ status: 'fulfilled', value: null });
    expect(outcomes.get(9004)).toMatchObject({ status: 'fulfilled', value: { characterId: 9004 } });
    expect(affiliationCalls()).toEqual([[9001, 9002, 9003, 9004], [9004]]);
  });

  it('makes no affiliation call when no member is due and returns the stored rows', async () => {
    const kept = storedRoles({ characterId: 9001 });
    storeRows([kept]);
    mocks.isDue.mockResolvedValue(false);

    const outcomes = await fetchCorpRolesForMembers([9001, 9002]);

    expect(mocks.fetchAffiliations).not.toHaveBeenCalled();
    expect(mocks.readStoredAuthed).not.toHaveBeenCalled();
    expect(outcomes).toEqual(new Map([[9001, { status: 'fulfilled', value: kept }], [9002, { status: 'fulfilled', value: null }]]));
  });

  it('settles a member null without a call when no token can be vended or no corporation is known, and asks once per member', async () => {
    mocks.getFreshAccessTokenForCharacter.mockImplementation(async (characterId: number) =>
      characterId === 9001 ? { kind: 'reauth_required' } : { kind: 'ok', accessToken: 'vended', expiresAt: 1 });
    mocks.readRoleCorporationId.mockImplementation(async (characterId: number) => characterId === 9002 ? null : 98001);

    const outcomes = await fetchCorpRolesForMembers([9001, 9002, 9003, 9003]);

    expect(outcomes.get(9001)).toEqual({ status: 'fulfilled', value: null });
    expect(outcomes.get(9002)).toEqual({ status: 'fulfilled', value: null });
    expect(affiliationCalls()).toEqual([[9003], [9003]]);
    expect(mocks.readStoredAuthed).toHaveBeenCalledExactlyOnceWith(rolesKey(9003), 'vended', { conditional: false });
  });

  it('settles a member with an unexpected failure while it plans, leaving the rest', async () => {
    const failure = new Error('db down');
    mocks.readRoleCorporationId.mockImplementation(async (characterId: number) => {
      if (characterId === 9001) throw failure;
      return 98001;
    });

    const outcomes = await fetchCorpRolesForMembers([9001, 9002]);

    expect(outcomes.get(9001)).toEqual({ status: 'rejected', reason: failure });
    expect(outcomes.get(9002)).toMatchObject({ status: 'fulfilled', value: { characterId: 9002 } });
  });

  it('does not return roles the upsert refused when the stored affiliation moved during the read', async () => {
    mocks.upsertCorpRoles.mockResolvedValue(false);

    const outcomes = await fetchCorpRolesForMembers([9001]);

    expect(outcomes.get(9001)).toEqual({ status: 'fulfilled', value: null });
    expect(mocks.recordMetas).not.toHaveBeenCalled();
  });
});
