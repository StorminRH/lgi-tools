import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted so the vi.mock factories below can close over them.
const h = vi.hoisted(() => ({
  // The first select returns selectRows; a SECOND select (the lost-race re-read)
  // returns rereadRows when set — lets a single test drive read → write → re-read.
  selectRows: [] as Record<string, unknown>[],
  rereadRows: null as Record<string, unknown>[] | null,
  selectCount: 0,
  // Controls whether a conditional UPDATE "won" (>=1 row) or "lost" (0 rows).
  updateReturning: [{ id: 'acc1' }] as { id: string }[],
  updateSpy: vi.fn(),
  refreshEveTokenMock: vi.fn(),
  logUsageEventMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            h.selectCount += 1;
            const rows =
              h.selectCount >= 2 && h.rereadRows !== null ? h.rereadRows : h.selectRows;
            return Promise.resolve(rows);
          },
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          h.updateSpy(vals);
          return { returning: () => Promise.resolve(h.updateReturning) };
        },
      }),
    }),
  },
}));

vi.mock('@/data/telemetry/queries', () => ({ logUsageEvent: h.logUsageEventMock }));

vi.mock('./eve-sso', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./eve-sso')>();
  return { ...actual, refreshEveToken: h.refreshEveTokenMock };
});

// Real crypto with a deterministic key, so we can assert ciphertext shape.
const VALID_KEY = Buffer.alloc(32, 9).toString('base64');

import { getFreshAccessTokenForCharacter } from './eve-token-service';
import { decryptToken, encryptToken } from './token-crypto';

const CHAR_ID = 90000001;
const future = () => new Date(Date.now() + 10 * 60 * 1000);
const past = () => new Date(Date.now() - 1000);

beforeEach(() => {
  vi.stubEnv('EVE_TOKEN_ENCRYPTION_KEY', VALID_KEY);
  vi.stubEnv('EVE_CLIENT_ID', 'client-id');
  vi.stubEnv('EVE_CLIENT_SECRET', 'client-secret');
  h.selectRows = [];
  h.rereadRows = null;
  h.selectCount = 0;
  h.updateReturning = [{ id: 'acc1' }];
  h.updateSpy.mockClear();
  h.refreshEveTokenMock.mockReset();
  h.logUsageEventMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getFreshAccessTokenForCharacter', () => {
  it('returns not_found when no account row exists', async () => {
    h.selectRows = [];
    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'not_found' });
    expect(h.refreshEveTokenMock).not.toHaveBeenCalled();
  });

  it('returns reauth_required (no network) when the refresh token will not decrypt', async () => {
    h.selectRows = [
      { id: 'acc1', accessToken: null, refreshToken: 'legacy-plaintext', accessTokenExpiresAt: null, scope: null },
    ];
    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'reauth_required' });
    expect(h.refreshEveTokenMock).not.toHaveBeenCalled();
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it('hands back a still-valid cached access token without hitting EVE', async () => {
    h.selectRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('cached-access'),
        refreshToken: encryptToken('stored-refresh'),
        accessTokenExpiresAt: future(),
        scope: null,
      },
    ];
    const result = await getFreshAccessTokenForCharacter(CHAR_ID);
    // scope was null on the row → honest empty list, not the assumed full set.
    expect(result).toMatchObject({ kind: 'ok', accessToken: 'cached-access', scopes: [] });
    expect(h.refreshEveTokenMock).not.toHaveBeenCalled();
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it('refreshes near expiry and persists the rotated refresh token as ciphertext', async () => {
    h.selectRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('old-access'),
        refreshToken: encryptToken('old-refresh'),
        accessTokenExpiresAt: past(),
        scope: 'publicData esi-skills.read_skills.v1',
      },
    ];
    h.refreshEveTokenMock.mockResolvedValue({
      kind: 'ok',
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 1200,
    });

    const result = await getFreshAccessTokenForCharacter(CHAR_ID);

    expect(result).toMatchObject({
      kind: 'ok',
      accessToken: 'new-access',
      characterId: CHAR_ID,
      scopes: ['publicData', 'esi-skills.read_skills.v1'],
    });
    if (result.kind === 'ok') {
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 1190 * 1000);
    }
    // Decrypted the stored refresh token before refreshing.
    expect(h.refreshEveTokenMock).toHaveBeenCalledWith({
      refreshToken: 'old-refresh',
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });
    // Persisted both tokens as v1 ciphertext, not plaintext.
    const persisted = h.updateSpy.mock.calls[0]![0] as { accessToken: string; refreshToken: string };
    expect(persisted.refreshToken.startsWith('v1:')).toBe(true);
    expect(persisted.accessToken.startsWith('v1:')).toBe(true);
    expect(decryptToken(persisted.refreshToken)).toBe('new-refresh');
    expect(decryptToken(persisted.accessToken)).toBe('new-access');
  });

  it('nulls token custody and returns reauth_required on a genuinely dead refresh token (1 row)', async () => {
    h.selectRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('old-access'),
        refreshToken: encryptToken('old-refresh'),
        accessTokenExpiresAt: past(),
        scope: null,
      },
    ];
    h.refreshEveTokenMock.mockResolvedValue({ kind: 'dead' });
    h.updateReturning = [{ id: 'acc1' }]; // conditional NULL matched → we held the latest token

    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'reauth_required' });
    const cleared = h.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(cleared.accessToken).toBeNull();
    expect(cleared.refreshToken).toBeNull();
    expect(cleared.accessTokenExpiresAt).toBeNull();
    expect(h.logUsageEventMock).not.toHaveBeenCalled();
  });

  it('reflects the winner\'s token when the success write loses the race (0 rows)', async () => {
    h.selectRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('old-access'),
        refreshToken: encryptToken('old-refresh'),
        accessTokenExpiresAt: past(),
        scope: 'publicData',
      },
    ];
    h.refreshEveTokenMock.mockResolvedValue({
      kind: 'ok',
      access_token: 'my-access',
      refresh_token: 'my-refresh',
      expires_in: 1200,
    });
    h.updateReturning = []; // 0 rows: a concurrent winner already wrote a different token
    h.rereadRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('winner-access'),
        refreshToken: encryptToken('winner-refresh'),
        accessTokenExpiresAt: future(),
        scope: 'publicData',
      },
    ];

    const result = await getFreshAccessTokenForCharacter(CHAR_ID);
    // Reflects the persisted (winner's) token, NOT our own minted one — and never nulls.
    expect(result).toMatchObject({ kind: 'ok', accessToken: 'winner-access', scopes: ['publicData'] });
    expect(h.logUsageEventMock).not.toHaveBeenCalled();
  });

  it('on a dead refresh that lost the race (0 rows), logs the race signal and reflects the winner', async () => {
    h.selectRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('old-access'),
        refreshToken: encryptToken('old-refresh'),
        accessTokenExpiresAt: past(),
        scope: null,
      },
    ];
    h.refreshEveTokenMock.mockResolvedValue({ kind: 'dead' });
    h.updateReturning = []; // 0 rows: a concurrent winner rotated before our NULL landed
    h.rereadRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('winner-access'),
        refreshToken: encryptToken('winner-refresh'),
        accessTokenExpiresAt: future(),
        scope: null,
      },
    ];

    const result = await getFreshAccessTokenForCharacter(CHAR_ID);
    expect(result).toMatchObject({ kind: 'ok', accessToken: 'winner-access' });
    expect(h.logUsageEventMock).toHaveBeenCalledTimes(1);
    expect(h.logUsageEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'eve_token_refresh_race', characterId: CHAR_ID }),
    );
  });

  it('returns reauth_required when a lost-race re-read finds the account genuinely tokenless', async () => {
    h.selectRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('old-access'),
        refreshToken: encryptToken('old-refresh'),
        accessTokenExpiresAt: past(),
        scope: null,
      },
    ];
    h.refreshEveTokenMock.mockResolvedValue({ kind: 'dead' });
    h.updateReturning = [];
    h.rereadRows = [
      { id: 'acc1', accessToken: null, refreshToken: null, accessTokenExpiresAt: null, scope: null },
    ];

    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'reauth_required' });
    // Telemetry still fires (it was a 0-row dead); the re-read just found no token.
    expect(h.logUsageEventMock).toHaveBeenCalledTimes(1);
  });

  it('returns reauth_required when a lost-race re-read finds an expired token (mirrors the skew guard)', async () => {
    h.selectRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('old-access'),
        refreshToken: encryptToken('old-refresh'),
        accessTokenExpiresAt: past(),
        scope: null,
      },
    ];
    h.refreshEveTokenMock.mockResolvedValue({
      kind: 'ok',
      access_token: 'my-access',
      refresh_token: 'my-refresh',
      expires_in: 1200,
    });
    h.updateReturning = []; // 0 rows: lost the success write
    h.rereadRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('winner-access'),
        refreshToken: encryptToken('winner-refresh'),
        accessTokenExpiresAt: past(), // stored token is already expired
        scope: null,
      },
    ];

    // Reflecting a token inside the refresh skew would hand back one ESI rejects —
    // fall through to reauth_required instead, consistent with the main vend path.
    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'reauth_required' });
  });

  it('preserves custody (no DB write) and returns upstream_error on a transient failure', async () => {
    h.selectRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('old-access'),
        refreshToken: encryptToken('old-refresh'),
        accessTokenExpiresAt: past(),
        scope: null,
      },
    ];
    h.refreshEveTokenMock.mockResolvedValue({ kind: 'retryable' });

    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'upstream_error' });
    expect(h.updateSpy).not.toHaveBeenCalled();
  });
});
