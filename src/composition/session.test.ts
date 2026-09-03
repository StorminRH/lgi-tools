import { afterEach, expect, test, vi } from 'vitest';

const getSessionApiMock = vi.fn();
vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSessionApiMock(...args) } },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { getSession, getSessionCharacterId } from '@/composition/session';

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

test('getSession and getSessionCharacterId reshape enrichment, and both null out when logged out', async () => {
  getSessionApiMock.mockResolvedValue(ENRICHED);
  await expect(getSession()).resolves.toEqual({
    characterId: 90000001,
    name: 'Test Pilot',
    portraitUrl: 'https://images.evetech.net/characters/90000001/portrait?size=128',
    role: 'ADMIN',
  });
  await expect(getSessionCharacterId()).resolves.toBe(90000001);

  getSessionApiMock.mockResolvedValue({ ...ENRICHED, characterId: null });
  await expect(getSession()).resolves.toBeNull();
  await expect(getSessionCharacterId()).resolves.toBeNull();

  getSessionApiMock.mockResolvedValue(null);
  await expect(getSession()).resolves.toBeNull();
  await expect(getSessionCharacterId()).resolves.toBeNull();
});
