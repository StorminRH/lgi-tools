import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';

const readEsiAuthedMock = vi.hoisted(() => vi.fn());

vi.mock('@/platform/auth/eve-token-service', () => ({
  getFreshAccessTokenForCharacter: vi.fn(),
}));

vi.mock('@/platform/auth/affiliation-store', () => ({
  getUserAffiliations: vi.fn(),
}));

vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: vi.fn(),
}));

vi.mock('@/platform/esi/authed-read', () => ({
  readEsiAuthed: (...args: unknown[]) => readEsiAuthedMock(...args),
  readEsiPagedAuthed: vi.fn(),
}));

import { readRolesFor } from './owner-sync-port';

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
