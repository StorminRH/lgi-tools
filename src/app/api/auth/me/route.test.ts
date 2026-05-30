import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/features/auth/types';

const userSession: Session = {
  characterId: 12345,
  name: 'Test User',
  portraitUrl: 'https://images.evetech.net/characters/12345/portrait?size=128',
  role: 'USER',
};

const adminSession: Session = {
  characterId: 67890,
  name: 'Test Admin',
  portraitUrl: 'https://images.evetech.net/characters/67890/portrait?size=128',
  role: 'ADMIN',
};

const superSession: Session = {
  characterId: 1000000000,
  name: 'Test Pilot',
  portraitUrl: 'https://images.evetech.net/characters/1000000000/portrait?size=128',
  role: 'USER',
};

const getSessionMock = vi.fn();

// Mock only getSession; isAdmin stays the real implementation so the env-driven
// superadmin path is exercised end-to-end through the handler.
vi.mock('@/features/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/features/auth/session')>(
    '@/features/auth/session',
  );
  return {
    ...actual,
    getSession: () => getSessionMock(),
  };
});

async function importRoute() {
  return await import('./route');
}

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SUPERADMIN_CHARACTER_ID', '1000000000');
    getSessionMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the session and isAdmin:true for a DB-ADMIN', async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const { GET } = await importRoute();
    const res = await GET();
    expect(res.headers.get('cache-control')).toBe('no-store');
    await expect(res.json()).resolves.toEqual({ session: adminSession, isAdmin: true });
  });

  it('returns isAdmin:true for the env superadmin even with a USER DB role', async () => {
    getSessionMock.mockResolvedValue(superSession);
    const { GET } = await importRoute();
    const res = await GET();
    await expect(res.json()).resolves.toEqual({ session: superSession, isAdmin: true });
  });

  it('returns isAdmin:false for a plain USER', async () => {
    getSessionMock.mockResolvedValue(userSession);
    const { GET } = await importRoute();
    const res = await GET();
    await expect(res.json()).resolves.toEqual({ session: userSession, isAdmin: false });
  });

  it('returns { session: null, isAdmin: false } when logged out', async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await importRoute();
    const res = await GET();
    expect(res.headers.get('cache-control')).toBe('no-store');
    await expect(res.json()).resolves.toEqual({ session: null, isAdmin: false });
  });
});
