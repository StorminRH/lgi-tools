import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maps, mapAccess } from '@/data/maps/schema';
import { user } from '@/db/auth-schema';

const h = vi.hoisted(() => ({
  failure: '',
  remaining: new Set<string>(),
  sessions: new Map<string, string>(),
  userRole: 'ADMIN',
  userDeleted: false,
  remainingAtMint: [] as string[],
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}));

async function cleanup(stage: string, id: string) {
  if (h.failure === stage) throw new Error(`${stage} unavailable`);
  h.remaining.delete(`${stage}:${id}`);
}

vi.mock('@/db', () => ({ db: { select: h.select, insert: h.insert, delete: h.delete } }));
vi.mock('@/composition/auth', () => ({
  auth: {
    $context: Promise.resolve({
      secret: 'synthetic-cleanup-test-secret-32chars',
      internalAdapter: {
        async createSession(userId: string) {
          h.remainingAtMint = [...h.remaining];
          h.sessions.set('new-session', userId);
          return { token: 'new-session', expiresAt: new Date(Date.now() + 604800000) };
        },
      },
      authCookies: {
        sessionToken: { name: 'better-auth.session_token', attributes: { path: '/', httpOnly: true, sameSite: 'lax' } },
        sessionData: { name: 'better-auth.session_data', attributes: { path: '/' } },
        accountData: { name: 'better-auth.account_data', attributes: { path: '/' } },
        dontRememberToken: { name: 'better-auth.dont_remember', attributes: { path: '/' } },
      },
    }),
  },
}));
vi.mock('@/platform/auth/admin-users', () => ({
  async revokeUserSessions(userId: string) {
    for (const [token, owner] of h.sessions) {
      if (owner === userId) h.sessions.delete(token);
    }
  },
}));
vi.mock('@/composition/map-purge', () => ({
  purgeMapChain: (id: string) => cleanup('chain', id),
}));
vi.mock('@/composition/map-access-projection', () => ({
  teardownMapAccessProjection: (id: string) => cleanup('projection', id),
  purgeUserMapAccessProjection: (id: string) => cleanup('claims', id),
}));
vi.mock('@/data/location-tracking/purge', () => ({
  purgeLocationTracking: (id: string) => cleanup('location', id),
}));

import { becomeSyntheticPilot } from './synthetic-pilot-store';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('LGI_DATABASE_URL', '');
  vi.stubEnv('DATABASE_URL', 'postgres://postgres@localhost:5433/test');
  vi.stubEnv('LOCAL_DB_DRIVER', 'postgres-js');
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
  vi.stubEnv('BETTER_AUTH_SECRET', 'synthetic-cleanup-test-secret-32chars');
  vi.stubEnv('SUPERADMIN_CHARACTER_ID', '');
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'http://localhost:3210');
  h.failure = '';
  h.remaining = new Set(['chain:owned-map', 'projection:owned-map', 'claims:e2e-pilot', 'location:e2e-pilot', 'sql-acl']);
  h.sessions = new Map([['old-session', 'e2e-pilot'], ['unrelated-session', 'other-user']]);
  h.userRole = 'ADMIN';
  h.userDeleted = false;
  h.remainingAtMint = [];
  h.select.mockImplementation(() => ({
    from: (table: unknown) => ({ where: async () => table === maps ? [{ id: 'owned-map' }] : [] }),
  }));
  h.delete.mockImplementation((table: unknown) => ({
    async where() {
      if (table === mapAccess) h.remaining.delete('sql-acl');
      if (table === user) h.userDeleted = true;
    },
  }));
  h.insert.mockImplementation((table: unknown) => ({
    values(row: { role?: string }) {
      if (table === user) h.userRole = row.role ?? '';
      return { onConflictDoUpdate: async () => undefined };
    },
  }));
});

afterEach(() => vi.unstubAllEnvs());

describe('synthetic pilot cleanup before remint', () => {
  it.each(['chain', 'projection', 'claims', 'location'])(
    'preserves the user and rejects the mint when %s cleanup fails',
    async (stage) => {
      h.failure = stage;
      await expect(becomeSyntheticPilot()).rejects.toThrow(`${stage} unavailable`);
      expect([...h.sessions]).toEqual([['unrelated-session', 'other-user']]);
      expect(h.userDeleted).toBe(false);
      expect(h.userRole).toBe('ADMIN');
      expect(h.remaining.has('sql-acl')).toBe(true);
      expect(h.remaining.has(`${stage}:${stage === 'chain' || stage === 'projection' ? 'owned-map' : 'e2e-pilot'}`)).toBe(true);
    },
  );

  it('cleans map state before returning a replacement session cookie', async () => {
    const issued = await becomeSyntheticPilot();
    expect([...h.remaining]).toEqual([]);
    expect(h.remainingAtMint).toEqual([]);
    expect(h.userDeleted).toBe(true);
    expect(h.userRole).toBe('USER');
    expect([...h.sessions]).toEqual([
      ['unrelated-session', 'other-user'],
      ['new-session', 'e2e-pilot'],
    ]);
    expect(issued.cookies).toEqual([
      expect.objectContaining({ name: 'better-auth.session_token', domain: 'localhost', httpOnly: true, sameSite: 'Lax' }),
    ]);
    expect(issued.headers.get('set-cookie')).toContain('better-auth.session_token=new-session.');
  });
});
