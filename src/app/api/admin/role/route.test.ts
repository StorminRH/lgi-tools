import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/features/auth/types';

const ADMIN_SESSION: Session = {
  characterId: 2114872920,
  name: 'Nimrots Sarikusa',
  portraitUrl: 'https://images.evetech.net/characters/2114872920/portrait?size=128',
  role: 'ADMIN',
};

const getSessionMock = vi.fn();
const getCharacterByIdMock = vi.fn();
const setCharacterRoleMock = vi.fn();

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
  getCharacterById: (id: number) => getCharacterByIdMock(id),
  setCharacterRole: (id: number, role: string) => setCharacterRoleMock(id, role),
}));

async function importRoute() {
  return await import('./route');
}

function buildRequest(form: Record<string, string>): NextRequest {
  const body = new URLSearchParams(form).toString();
  return new NextRequest('http://localhost:3000/api/admin/role', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
}

describe('POST /api/admin/role', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SUPERADMIN_CHARACTER_ID', '2114872920');
    getSessionMock.mockReset();
    getCharacterByIdMock.mockReset();
    setCharacterRoleMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 403 when the caller is not an admin', async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ characterId: '12345', nextRole: 'ADMIN' }));
    expect(res.status).toBe(403);
    expect(setCharacterRoleMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the caller tries to toggle their own role', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    const { POST } = await importRoute();
    const res = await POST(
      buildRequest({
        characterId: String(ADMIN_SESSION.characterId),
        nextRole: 'USER',
      }),
    );
    expect(res.status).toBe(400);
    expect(setCharacterRoleMock).not.toHaveBeenCalled();
  });

  it('returns 400 when nextRole is not in CHARACTER_ROLES', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    const { POST } = await importRoute();
    const res = await POST(
      buildRequest({ characterId: '12345', nextRole: 'SUPERADMIN' }),
    );
    expect(res.status).toBe(400);
    expect(setCharacterRoleMock).not.toHaveBeenCalled();
  });
});
