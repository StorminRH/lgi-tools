import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { account } from '@/db/auth-schema';
import { createDbTestHarness, seedEveAccount } from '@/db/__tests__/support/db-test-harness';
import { decryptToken, encryptToken } from '@/platform/auth/token-crypto';
import { vendTokenFor } from './owner-sync-port';

const CHARACTER_ID = 90000017;
const harness = await createDbTestHarness({
  schema: 'test_owner_sync_vend',
  tables: ['account'],
  steerDbProxy: true,
  env: {
    EVE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    EVE_CLIENT_ID: 'client-id',
    EVE_CLIENT_SECRET: 'client-secret',
  },
});

function refreshTokenIn(init: RequestInit | undefined): string | null {
  return typeof init?.body === 'string' ? new URLSearchParams(init.body).get('refresh_token') : null;
}

describe.skipIf(!harness.reachable)('owner-sync token vending (real Postgres)', () => {
  it('refreshes once for the four datasets a board view vends side by side and serves nothing after custody ends', async () => {
    await seedEveAccount(harness.db, { id: 'acc1', characterId: CHARACTER_ID, userId: 'user-1' }, {
      accessToken: encryptToken('expired-access'),
      refreshToken: encryptToken('RT0'),
      accessTokenExpiresAt: new Date(Date.now() - 1000),
      scope: 'publicData',
    });
    // CCP rotates the refresh token on every refresh, so a consumed one answers invalid_grant.
    const consumed = new Set<string>();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const token = refreshTokenIn(init);
      if (token === null || consumed.has(token)) {
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      }
      consumed.add(token);
      return Response.json({ access_token: 'rotated-access', refresh_token: 'RT1', expires_in: 1200 });
    });

    try {
      const vends = await Promise.all(Array.from({ length: 4 }, () => vendTokenFor(CHARACTER_ID)));

      expect(vends).toEqual(['rotated-access', 'rotated-access', 'rotated-access', 'rotated-access']);
      expect(fetchSpy).toHaveBeenCalledOnce();
      const [rotated] = await harness.db.select().from(account).where(eq(account.id, 'acc1'));
      expect(decryptToken(rotated?.refreshToken ?? '')).toBe('RT1');
      expect(rotated?.refreshTokenInvalidGrantCount).toBe(0);

      // Unlinking ends custody after the vend settled; the next vend must not reuse its token.
      await harness.db.update(account).set({ refreshToken: null }).where(eq(account.id, 'acc1'));
      await expect(vendTokenFor(CHARACTER_ID)).resolves.toEqual({ missing: 'lost' });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
