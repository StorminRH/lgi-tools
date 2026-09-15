import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';

const readEsiAuthedMock = vi.hoisted(() => vi.fn());

vi.mock('@/platform/auth/eve-token-service', () => ({
  getFreshAccessTokenForCharacter: vi.fn(),
}));

const loadUserCorpAccessMock = vi.hoisted(() => vi.fn());

vi.mock('@/platform/auth/user-corp-access', () => ({
  loadUserCorpAccess: (...args: unknown[]) => loadUserCorpAccessMock(...args),
}));

vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: vi.fn(),
}));

vi.mock('@/platform/esi/authed-read', () => ({
  readEsiAuthed: (...args: unknown[]) => readEsiAuthedMock(...args),
  readEsiPagedAuthed: vi.fn(),
}));

import { readRolesFor, resolveOwnedOwnersForUser } from './owner-sync-port';

describe('resolveOwnedOwnersForUser', () => {
  beforeEach(() => {
    loadUserCorpAccessMock.mockReset();
  });

  it('enumerates linked characters and current corporations only', async () => {
    loadUserCorpAccessMock.mockResolvedValue({
      userId: 'u1',
      characterIds: [101, 202],
      corporationIds: [2000],
      refreshTransientFailure: false,
      has: (corporationId: number) => corporationId === 2000,
      characterIdsIn: (corporationId: number) => (corporationId === 2000 ? [101] : []),
      decide: async () => ({ allowed: true, reason: 'member', characterId: 101 }),
    });

    await expect(resolveOwnedOwnersForUser('u1')).resolves.toEqual([
      { ownerType: 'character', ownerId: 101 },
      { ownerType: 'character', ownerId: 202 },
      { ownerType: 'corporation', ownerId: 2000 },
    ]);
  });

  it('omits a stale corporation from the owner set', async () => {
    loadUserCorpAccessMock.mockResolvedValue({
      userId: 'u1',
      characterIds: [101],
      corporationIds: [],
      refreshTransientFailure: false,
      has: () => false,
      characterIdsIn: () => [],
      decide: async () => ({ allowed: false, reason: 'not_member', characterId: null }),
    });

    await expect(resolveOwnedOwnersForUser('u1')).resolves.toEqual([
      { ownerType: 'character', ownerId: 101 },
    ]);
  });
});

describe('readRolesFor', () => {
  beforeEach(() => {
    readEsiAuthedMock.mockReset();
  });

  it('returns only string roles from a fresh ESI response', async () => {
    readEsiAuthedMock.mockResolvedValue({
      kind: 'fresh',
      body: { roles: ['Director', 42, 'Accountant'] },
      etag: null,
      expiresAt: null,
    });

    await expect(readRolesFor(9001, 'access-token')).resolves.toEqual([
      'Director',
      'Accountant',
    ]);
    expect(readEsiAuthedMock).toHaveBeenCalledWith(
      '/characters/9001/roles',
      'access-token',
      null,
    );
  });

  it('returns null for soft ESI failures but preserves budget deferrals', async () => {
    readEsiAuthedMock.mockResolvedValueOnce({ kind: 'error', code: 'esi_403' });
    await expect(readRolesFor(9001, 'access-token')).resolves.toBeNull();

    readEsiAuthedMock.mockRejectedValueOnce(new EsiBudgetExhaustedError(19));
    await expect(readRolesFor(9001, 'access-token')).rejects.toBeInstanceOf(
      EsiBudgetExhaustedError,
    );

    readEsiAuthedMock.mockRejectedValueOnce(new EsiServerError(503));
    await expect(readRolesFor(9001, 'access-token')).resolves.toBeNull();
  });

  it('does not hide an unexpected failure', async () => {
    const failure = new Error('unexpected');
    readEsiAuthedMock.mockRejectedValue(failure);

    await expect(readRolesFor(9001, 'access-token')).rejects.toBe(failure);
  });
});
