import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';

const mocks = vi.hoisted(() => ({
  readEsiAuthed: vi.fn(),
  upsertCorpRoles: vi.fn(async () => {}),
  getFreshAccessTokenForCharacter: vi.fn(),
}));

vi.mock('@/platform/auth/eve-token-service', () => ({
  getFreshAccessTokenForCharacter: mocks.getFreshAccessTokenForCharacter,
}));

vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: vi.fn(),
}));

vi.mock('@/platform/auth/corp-roles-store', () => ({
  upsertCorpRoles: mocks.upsertCorpRoles,
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
  mocks.readEsiAuthed.mockReset();
  mocks.upsertCorpRoles.mockClear();
  mocks.getFreshAccessTokenForCharacter.mockReset();
});

describe('probeAndStoreRoles', () => {
  it('stores all four role arrays and returns the global list the credential probe selects by', async () => {
    mocks.readEsiAuthed.mockResolvedValue({ kind: 'fresh', body: fullBody, etag: null, expiresAt: null });

    await expect(probeAndStoreRoles(9001, 'access-token')).resolves.toEqual(['Director', 'Accountant']);
    expect(mocks.readEsiAuthed).toHaveBeenCalledWith('/characters/9001/roles', 'access-token', null);
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date));
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

  it('does not hide an unexpected failure', async () => {
    const failure = new Error('unexpected');
    mocks.readEsiAuthed.mockRejectedValue(failure);

    await expect(probeAndStoreRoles(9001, 'access-token')).rejects.toBe(failure);
  });
});

describe('fetchAndStoreCorpRoles', () => {
  it('vends the token itself and returns the full record it stored', async () => {
    mocks.getFreshAccessTokenForCharacter.mockResolvedValue({ kind: 'ok', accessToken: 'vended', expiresAt: 1 });
    mocks.readEsiAuthed.mockResolvedValue({ kind: 'fresh', body: fullBody, etag: null, expiresAt: null });

    await expect(fetchAndStoreCorpRoles(9001)).resolves.toEqual(storedRecord);
    expect(mocks.readEsiAuthed).toHaveBeenCalledWith('/characters/9001/roles', 'vended', null);
    expect(mocks.upsertCorpRoles).toHaveBeenCalledWith(9001, storedRecord, expect.any(Date));
  });

  it('returns null without an ESI call when no token can be vended', async () => {
    mocks.getFreshAccessTokenForCharacter.mockResolvedValue({ kind: 'reauth_required' });

    await expect(fetchAndStoreCorpRoles(9001)).resolves.toBeNull();
    expect(mocks.readEsiAuthed).not.toHaveBeenCalled();
  });
});
