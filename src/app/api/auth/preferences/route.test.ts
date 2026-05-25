import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/features/auth/types';

const USER_SESSION: Session = {
  characterId: 2114872920,
  name: 'Nimrots Sarikusa',
  portraitUrl: 'https://images.evetech.net/characters/2114872920/portrait?size=128',
  role: 'USER',
};

const getSessionMock = vi.fn();
const setCharacterPreferenceMock = vi.fn();

vi.mock('@/features/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/features/auth/session')>(
    '@/features/auth/session',
  );
  return {
    ...actual,
    getSession: () => getSessionMock(),
  };
});

vi.mock('@/features/auth/queries', () => ({
  setCharacterPreference: (characterId: number, key: string, value: unknown) =>
    setCharacterPreferenceMock(characterId, key, value),
}));

async function importRoute() {
  return await import('./route');
}

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/preferences', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/preferences', () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset();
    setCharacterPreferenceMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when the caller is logged out', async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ key: 'theme', value: 'dark' }));
    expect(res.status).toBe(401);
    expect(setCharacterPreferenceMock).not.toHaveBeenCalled();
  });

  it('writes a valid key/value pair', async () => {
    getSessionMock.mockResolvedValue(USER_SESSION);
    setCharacterPreferenceMock.mockResolvedValue({ theme: 'dark' });
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ key: 'theme', value: 'dark' }));
    expect(res.status).toBe(200);
    expect(setCharacterPreferenceMock).toHaveBeenCalledWith(
      USER_SESSION.characterId,
      'theme',
      'dark',
    );
  });

  it('rejects keys that do not match the slug pattern', async () => {
    getSessionMock.mockResolvedValue(USER_SESSION);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ key: '1bad-start', value: 'whatever' }));
    expect(res.status).toBe(400);
    expect(setCharacterPreferenceMock).not.toHaveBeenCalled();
  });

  it('rejects keys longer than the max length', async () => {
    getSessionMock.mockResolvedValue(USER_SESSION);
    const { POST } = await importRoute();
    const longKey = 'a' + 'b'.repeat(100);
    const res = await POST(buildRequest({ key: longKey, value: 'x' }));
    expect(res.status).toBe(400);
    expect(setCharacterPreferenceMock).not.toHaveBeenCalled();
  });

  it('rejects oversized values', async () => {
    getSessionMock.mockResolvedValue(USER_SESSION);
    const { POST } = await importRoute();
    const big = 'x'.repeat(5000);
    const res = await POST(buildRequest({ key: 'note', value: big }));
    expect(res.status).toBe(400);
    expect(setCharacterPreferenceMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the character row no longer exists', async () => {
    getSessionMock.mockResolvedValue(USER_SESSION);
    setCharacterPreferenceMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ key: 'theme', value: 'dark' }));
    expect(res.status).toBe(404);
  });
});
