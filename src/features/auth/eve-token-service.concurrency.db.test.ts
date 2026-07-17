import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDbTestHarness,
  seedEveAccount,
} from '@/db/test-support/db-test-harness';
import {
  getFreshAccessTokenForCharacter,
  INVALID_GRANT_CONFIRMATION_GRACE_MS,
} from './eve-token-service';
import { account } from './schema';
import { decryptToken, encryptToken } from './token-crypto';

// Proves the token-vend compare-and-swap against the REAL local Docker Postgres
// (postgres-js): the conditional `WHERE refresh_token = <ciphertext as read>` is
// the load-bearing claim, and a mocked rowCount can't prove it actually matches
// 0 rows under genuine concurrency. Covers the orderings the design hinges on:
// rotation winning over a first strike, a confirming NULL landing before the
// winner's write (whose IS NULL arm must repair it), and re-auth replacing the
// token mid-vend without being clobbered. Skips cleanly when no DB is reachable.

const CHAR_ID = 90000007;
const KEY = Buffer.alloc(32, 7).toString('base64');
const harness = await createDbTestHarness({
  schema: 'test_token_vend_cov',
  tables: ['account', 'usage_logs'],
  steerDbProxy: true,
  env: {
    EVE_TOKEN_ENCRYPTION_KEY: KEY,
    EVE_CLIENT_ID: 'client-id',
    EVE_CLIENT_SECRET: 'client-secret',
  },
  resetBetweenTests: 'delete',
});
const future = () => new Date(Date.now() + 10 * 60 * 1000);
const past = () => new Date(Date.now() - 1000);

async function waitFor(pred: () => Promise<boolean>, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('waitFor: condition not met before timeout');
}

describe.skipIf(!harness.reachable)('token vend compare-and-swap (real Postgres concurrency)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  async function seedAccount(
    refreshPlain: string,
    accessPlain: string,
    expiresAt: Date,
    invalidGrantCount = 0,
    invalidGrantFirstAt: Date | null = null,
  ) {
    await seedEveAccount(harness.db, { id: 'acc1', characterId: CHAR_ID, userId: 'user-1' }, {
      accessToken: encryptToken(accessPlain),
      refreshToken: encryptToken(refreshPlain),
      accessTokenExpiresAt: expiresAt,
      refreshTokenInvalidGrantCount: invalidGrantCount,
      refreshTokenInvalidGrantFirstAt: invalidGrantFirstAt,
      scope: 'publicData',
    });
  }

  async function readAccount() {
    const [row] = await harness.db.select().from(account).where(eq(account.id, 'acc1')).limit(1);
    return row!;
  }

  async function rawRefreshToken(): Promise<string | null> {
    const rows = await harness.sql<
      { refresh_token: string | null }[]
    >`SELECT refresh_token FROM account WHERE id = 'acc1'`;
    return rows[0]?.refresh_token ?? null;
  }

  function refreshTokenIn(init: unknown): string | null {
    const body = (init as RequestInit | undefined)?.body;
    return typeof body === 'string' ? new URLSearchParams(body).get('refresh_token') : null;
  }

  it('two concurrent vends rotate the token exactly once and never destroy custody', async () => {
    await seedAccount('RT0', 'old-access', past());

    // First submission of a given token wins (200 + rotated); any later submission
    // of the SAME token is rejected invalid_grant — the invalidating-rotation regime.
    const consumed = new Set<string>();
    fetchSpy.mockImplementation(async (_url: unknown, init?: unknown) => {
      const token = refreshTokenIn(init);
      if (token !== null && consumed.has(token)) {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      }
      if (token !== null) consumed.add(token);
      return new Response(
        JSON.stringify({ access_token: 'win-access', refresh_token: 'RT1', expires_in: 1200 }),
        { status: 200 },
      );
    });

    const [r1, r2] = await Promise.all([
      getFreshAccessTokenForCharacter(CHAR_ID),
      getFreshAccessTokenForCharacter(CHAR_ID),
    ]);

    const row = await readAccount();
    // Custody survives and exactly one rotation persisted — never NULL, never double.
    expect(row.refreshToken).not.toBeNull();
    expect(decryptToken(row.refreshToken as string)).toBe('RT1');
    expect(row.refreshTokenInvalidGrantCount).toBe(0);
    expect(row.refreshTokenInvalidGrantFirstAt).toBeNull();
    // At least the winner got a usable token (the loser is ok-via-reflect or a
    // transient reauth depending on which write committed first).
    expect([r1.kind, r2.kind]).toContain('ok');
  });

  it("repairs a confirmed-dead row: the concurrent winner's IS NULL arm restores custody", async () => {
    await seedAccount(
      'RT0',
      'old-access',
      past(),
      1,
      new Date(Date.now() - INVALID_GRANT_CONFIRMATION_GRACE_MS),
    );

    let entered = 0;
    let bothEntered!: () => void;
    const both = new Promise<void>((r) => {
      bothEntered = r;
    });
    let releaseWinner!: () => void;
    const winnerGate = new Promise<void>((r) => {
      releaseWinner = r;
    });
    let call = 0;
    fetchSpy.mockImplementation(async () => {
      const n = call++;
      entered += 1;
      if (entered === 2) bothEntered();
      if (n === 0) {
        // Loser: only confirm invalid_grant once BOTH vends have read strike 1,
        // so the winner is guaranteed to hold RT0 when it writes.
        await both;
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      }
      // Winner: held until the loser has committed its NULL.
      await winnerGate;
      return new Response(
        JSON.stringify({ access_token: 'win-access', refresh_token: 'RT1', expires_in: 1200 }),
        { status: 200 },
      );
    });

    const race = Promise.all([
      getFreshAccessTokenForCharacter(CHAR_ID),
      getFreshAccessTokenForCharacter(CHAR_ID),
    ]);
    await waitFor(async () => (await rawRefreshToken()) === null);
    releaseWinner();
    const results = await race;

    const row = await readAccount();
    expect(row.refreshToken).not.toBeNull();
    // The winner's IS NULL arm repaired the confirming loser's null.
    expect(decryptToken(row.refreshToken as string)).toBe('RT1');
    expect(row.refreshTokenInvalidGrantCount).toBe(0);
    expect(row.refreshTokenInvalidGrantFirstAt).toBeNull();
    expect(results.map((r) => r.kind).sort()).toEqual(['ok', 'reauth_required']);
  });

  it('re-arms grace after an ambiguous confirmation failure and suppresses the next vend', async () => {
    const originalFirstAt = new Date(Date.now() - INVALID_GRANT_CONFIRMATION_GRACE_MS);
    await seedAccount('RT0', 'old-access', past(), 1, originalFirstAt);
    fetchSpy.mockResolvedValue(new Response('provider unavailable', { status: 503 }));

    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'upstream_error' });
    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'upstream_error' });

    const row = await readAccount();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(row.refreshToken).not.toBeNull();
    expect(row.refreshTokenInvalidGrantCount).toBe(1);
    expect(row.refreshTokenInvalidGrantFirstAt?.getTime()).toBeGreaterThan(
      originalFirstAt.getTime(),
    );
  });

  it('does not clobber a fresh token a re-auth wrote mid-vend (success write finds 0 rows → reflects)', async () => {
    await seedAccount('RT0', 'old-access', past());

    let releaseVend!: () => void;
    const gate = new Promise<void>((r) => {
      releaseVend = r;
    });
    let signalEntered!: () => void;
    const entered = new Promise<void>((r) => {
      signalEntered = r;
    });
    fetchSpy.mockImplementation(async () => {
      signalEntered(); // the vend has read RT0 and is now at the EVE call
      await gate;
      return new Response(
        JSON.stringify({ access_token: 'vend-access', refresh_token: 'RT_vend', expires_in: 1200 }),
        { status: 200 },
      );
    });

    const vend = getFreshAccessTokenForCharacter(CHAR_ID);
    await entered; // guarantee the vend read RT0 before the re-auth replaces it
    await harness.db
      .update(account)
      .set({
        refreshToken: encryptToken('RT_new'),
        accessToken: encryptToken('reauth-access'),
        accessTokenExpiresAt: future(),
      })
      .where(eq(account.id, 'acc1'));
    releaseVend();
    const result = await vend;

    const row = await readAccount();
    // The re-auth's token survives — the in-flight vend matched 0 rows and reflected.
    expect(decryptToken(row.refreshToken as string)).toBe('RT_new');
    expect(result).toMatchObject({ kind: 'ok', accessToken: 'reauth-access' });
  });
});
