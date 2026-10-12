import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { StoredCorpRoles } from '@/platform/auth/corp-roles-store';
import type { FreshTokenResult } from '@/platform/auth/eve-token-service';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';

const mocks = vi.hoisted(() => ({
  fetchAffiliations: vi.fn(),
  readEsiAuthed: vi.fn(),
  readEsiAuthedPost: vi.fn(),
  readEsiPagedAuthed: vi.fn(),
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

vi.mock('@/platform/esi/authed-read', () => ({
  readEsiAuthed: (...args: unknown[]) => mocks.readEsiAuthed(...args),
  readEsiAuthedPost: (...args: unknown[]) => mocks.readEsiAuthedPost(...args),
  readEsiPagedAuthed: (...args: unknown[]) => mocks.readEsiPagedAuthed(...args),
}));

import {
  fetchAndStoreCorpRoles,
  postSingleEndpoint,
  probeAndStoreRoles,
  readPagedEndpoint,
  readRolesForSync,
  readSingleEndpoint,
  vendTokenFor,
} from './owner-sync-port';

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
  mocks.readEsiAuthedPost.mockReset();
  mocks.readEsiPagedAuthed.mockReset();
  mocks.upsertCorpRoles.mockReset().mockResolvedValue(true);
  mocks.readRoleCorporationId.mockReset().mockResolvedValue(98001);
  mocks.readCorpRoles.mockReset().mockResolvedValue(new Map());
  mocks.getFreshAccessTokenForCharacter.mockReset();
});

describe('probeAndStoreRoles', () => {
  it('stores all four role arrays and returns the global list the credential probe selects by', async () => {
    mocks.readEsiAuthed.mockResolvedValue({ kind: 'fresh', body: fullBody, etag: null, expiresAt: null });

    await expect(probeAndStoreRoles(9001, 'access-token')).resolves.toEqual(['Director', 'Accountant']);
    expect(mocks.readEsiAuthed).toHaveBeenCalledWith('/characters/9001/roles/', 'access-token', null);
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

const ROLES_FRESHNESS = freshnessGate('character_corp_roles');

function staleFetchedAt(): Date {
  return new Date(Date.now() - ROLES_FRESHNESS.ttlMs - 60_000);
}

function storedRoles(overrides: Partial<StoredCorpRoles> = {}): StoredCorpRoles {
  return {
    roles: ['Accountant'],
    rolesAtHq: [],
    rolesAtBase: [],
    rolesAtOther: [],
    characterId: 9001,
    corporationId: 98001,
    fetchedAt: new Date(),
    ...overrides,
  };
}

function holdStored(row: StoredCorpRoles): void {
  mocks.readCorpRoles.mockResolvedValue(new Map([[row.characterId, row]]));
}

describe('readRolesForSync', () => {
  it('returns fresh same-corporation stored roles without asking ESI', async () => {
    holdStored(storedRoles());

    await expect(readRolesForSync(9001, 'access-token')).resolves.toEqual(['Accountant']);
    expect(mocks.readCorpRoles).toHaveBeenCalledExactlyOnceWith([9001]);
    expect(mocks.fetchAffiliations).not.toHaveBeenCalled();
    expect(mocks.readEsiAuthed).not.toHaveBeenCalled();
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'older than the roles TTL', stored: () => [storedRoles({ fetchedAt: staleFetchedAt() })] },
    { name: 'stored for another corporation', stored: () => [storedRoles({ corporationId: 98002 })] },
    { name: 'missing', stored: () => [] },
  ])('probes ESI live and stores the result when the stored row is $name', async ({ stored }) => {
    mocks.readCorpRoles.mockResolvedValue(new Map(stored().map((row) => [row.characterId, row])));
    mocks.readEsiAuthed.mockResolvedValue({ kind: 'fresh', body: fullBody, etag: null, expiresAt: null });

    await expect(readRolesForSync(9001, 'access-token')).resolves.toEqual(['Director', 'Accountant']);
    expect(mocks.readEsiAuthed).toHaveBeenCalledWith('/characters/9001/roles/', 'access-token', null);
    expect(mocks.fetchAffiliations).toHaveBeenCalledTimes(2);
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date), 98001);
  });

  it('returns null without reading stored roles when the character has no known corporation', async () => {
    mocks.readRoleCorporationId.mockResolvedValue(null);
    holdStored(storedRoles());

    await expect(readRolesForSync(9001, 'access-token')).resolves.toBeNull();
    expect(mocks.readCorpRoles).not.toHaveBeenCalled();
    expect(mocks.readEsiAuthed).not.toHaveBeenCalled();
  });

  it('still defers for the ESI budget when it falls back to the live probe', async () => {
    holdStored(storedRoles({ fetchedAt: staleFetchedAt() }));
    const budget = new EsiBudgetExhaustedError(19);
    mocks.readEsiAuthed.mockRejectedValue(budget);

    await expect(readRolesForSync(9001, 'access-token')).rejects.toBe(budget);
    expect(mocks.upsertCorpRoles).not.toHaveBeenCalled();
  });

  it('leaves the mutation gates and the viewer fallback on the live probe', async () => {
    holdStored(storedRoles());
    mocks.getFreshAccessTokenForCharacter.mockResolvedValue({ kind: 'ok', accessToken: 'vended', expiresAt: 1 });
    mocks.readEsiAuthed.mockResolvedValue({ kind: 'fresh', body: fullBody, etag: null, expiresAt: null });

    await expect(probeAndStoreRoles(9001, 'access-token', 98001)).resolves.toEqual(['Director', 'Accountant']);
    await expect(fetchAndStoreCorpRoles(9001)).resolves.toMatchObject({ roles: ['Director', 'Accountant'] });
    expect(mocks.readCorpRoles).not.toHaveBeenCalled();
    expect(mocks.readEsiAuthed).toHaveBeenCalledTimes(2);
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
    expect(mocks.readEsiAuthed).toHaveBeenCalledWith('/characters/9001/roles/', 'vended', null);
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

describe('sync-port ESI reads', () => {
  it('hand fresh, unchanged and error reads to the port as ESI returned them', async () => {
    mocks.readEsiAuthed
      .mockResolvedValueOnce({ kind: 'fresh', body: [{ skill_id: 3300 }], etag: '"q"', expiresAt: 1_782_000_000_000 })
      .mockResolvedValueOnce({ kind: 'unchanged', expiresAt: 1_782_000_000_000 });

    await expect(readSingleEndpoint('/characters/9001/skills/', 'access-token', null)).resolves.toMatchObject({
      kind: 'fresh',
      body: [{ skill_id: 3300 }],
      etag: '"q"',
    });
    await expect(readSingleEndpoint('/characters/9001/skills/', 'access-token', '"q"')).resolves.toMatchObject({
      kind: 'unchanged',
    });
    expect(mocks.readEsiAuthed).toHaveBeenNthCalledWith(1, '/characters/9001/skills/', 'access-token', null);
    expect(mocks.readEsiAuthed).toHaveBeenNthCalledWith(2, '/characters/9001/skills/', 'access-token', '"q"');

    mocks.readEsiAuthedPost.mockResolvedValueOnce({ kind: 'error', code: 'esi_403' });
    await expect(postSingleEndpoint('/corporations/98001/assets/names/', 'access-token', [3001])).resolves.toEqual({
      kind: 'error',
      code: 'esi_403',
    });
    expect(mocks.readEsiAuthedPost).toHaveBeenCalledWith('/corporations/98001/assets/names/', 'access-token', [3001]);

    const responseHeaders = [{ page: 1, cacheControl: null, etag: '"p1"', lastModified: null, xPages: 1 }];
    mocks.readEsiPagedAuthed.mockResolvedValueOnce({
      kind: 'fresh',
      items: [{ structure_id: 1001 }],
      etags: ['"p1"'],
      expiresAt: null,
      responseHeaders,
    });
    await expect(readPagedEndpoint('/corporations/98001/structures/', 'access-token', [])).resolves.toMatchObject({
      kind: 'fresh',
      items: [{ structure_id: 1001 }],
      etags: ['"p1"'],
      responseHeaders,
    });
    expect(mocks.readEsiPagedAuthed).toHaveBeenCalledWith('/corporations/98001/structures/', 'access-token', []);
  });

  it.each([
    {
      name: 'readSingleEndpoint',
      esi: () => mocks.readEsiAuthed,
      read: () => readSingleEndpoint('/characters/9001/skills/', 'access-token', null),
    },
    {
      name: 'postSingleEndpoint',
      esi: () => mocks.readEsiAuthedPost,
      read: () => postSingleEndpoint('/corporations/98001/assets/names/', 'access-token', [3001]),
    },
    {
      name: 'readPagedEndpoint',
      esi: () => mocks.readEsiPagedAuthed,
      read: () => readPagedEndpoint('/corporations/98001/structures/', 'access-token', []),
    },
  ])('$name soft-fails an ESI server error but rethrows budget deferrals and unexpected failures', async ({ esi, read }) => {
    esi().mockRejectedValueOnce(new EsiServerError(503));
    await expect(read()).resolves.toEqual({ kind: 'error', code: 'esi_server_error' });

    const budget = new EsiBudgetExhaustedError(19);
    esi().mockRejectedValueOnce(budget);
    await expect(read()).rejects.toBe(budget);

    const failure = new Error('unexpected');
    esi().mockRejectedValueOnce(failure);
    await expect(read()).rejects.toBe(failure);
  });
});
