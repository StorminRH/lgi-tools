import { afterEach, describe, expect, it, vi } from 'vitest';

// session.ts is a thin shim over Better Auth: getSession()/getSessionCharacterId()
// read auth.api.getSession() and reshape the customSession enrichment into the
// legacy Session contract. Mock the auth instance + next/headers so these tests
// exercise the reshaping logic without a DB or the real Better Auth construction.
// (The full isAdmin() matrix lives in is-admin.test.ts.)

const getSessionApiMock = vi.fn();
vi.mock('./auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSessionApiMock(...args) } },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { getSession, getSessionCharacterId } from './session';

const ENRICHED = {
  user: { id: 'u1' },
  session: {},
  characterId: 90000001,
  name: 'Test Pilot',
  portraitUrl: 'https://images.evetech.net/characters/90000001/portrait?size=128',
  role: 'ADMIN' as const,
  isAdmin: true,
};

afterEach(() => {
  getSessionApiMock.mockReset();
});

describe('getSession', () => {
  it('returns null when there is no Better Auth session', async () => {
    getSessionApiMock.mockResolvedValue(null);
    await expect(getSession()).resolves.toBeNull();
  });

  it('maps the enriched session to the legacy Session shape', async () => {
    getSessionApiMock.mockResolvedValue(ENRICHED);
    await expect(getSession()).resolves.toEqual({
      characterId: 90000001,
      name: 'Test Pilot',
      portraitUrl: 'https://images.evetech.net/characters/90000001/portrait?size=128',
      role: 'ADMIN',
    });
  });

  it('returns null when the user has no linked character', async () => {
    getSessionApiMock.mockResolvedValue({ ...ENRICHED, characterId: null });
    await expect(getSession()).resolves.toBeNull();
  });
});

describe('getSessionCharacterId', () => {
  it('returns the active character id', async () => {
    getSessionApiMock.mockResolvedValue(ENRICHED);
    await expect(getSessionCharacterId()).resolves.toBe(90000001);
  });

  it('returns null when logged out', async () => {
    getSessionApiMock.mockResolvedValue(null);
    await expect(getSessionCharacterId()).resolves.toBeNull();
  });
});
