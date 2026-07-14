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
  emitDomainEventMock: vi.fn(),
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
vi.mock('@/data/domain-events/queries', () => ({ emitDomainEvent: h.emitDomainEventMock }));

vi.mock('./eve-sso', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./eve-sso')>();
  return { ...actual, refreshEveToken: h.refreshEveTokenMock };
});

// Real crypto with a deterministic key, so we can assert ciphertext shape.
const VALID_KEY = Buffer.alloc(32, 9).toString('base64');

import {
  getFreshAccessTokenForCharacter,
  INVALID_GRANT_CONFIRMATION_GRACE_MS,
} from './eve-token-service';
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
  h.emitDomainEventMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
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
    expect(h.emitDomainEventMock).not.toHaveBeenCalled();
  });

  it('records a first invalid_grant strike while preserving custody', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T20:00:00.000Z'));
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
      kind: 'dead',
      failureClass: 'invalid_grant',
    });
    h.updateReturning = [{ id: 'acc1' }];

    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'upstream_error' });
    const strike = h.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(strike).not.toHaveProperty('accessToken');
    expect(strike).not.toHaveProperty('refreshToken');
    expect(strike.refreshTokenInvalidGrantCount).toBe(1);
    expect(strike.refreshTokenInvalidGrantFirstAt).toEqual(
      new Date('2026-07-13T20:00:00.000Z'),
    );
    expect(h.logUsageEventMock).toHaveBeenCalledWith({
      action: 'eve_token_refresh_invalid_grant',
      characterId: CHAR_ID,
      metadata: { failureClass: 'invalid_grant' },
    });
    expect(h.logUsageEventMock).toHaveBeenCalledTimes(1);
    expect(h.emitDomainEventMock).toHaveBeenCalledWith({
      eventType: 'eve_token_state_changed',
      metadata: {
        characterId: CHAR_ID,
        from: 'usable',
        to: 'suspect',
        reason: 'invalid_grant',
      },
    });
  });

  it('suppresses provider calls at 4:59 without emitting refresh-failure telemetry', async () => {
    const now = new Date('2026-07-13T20:05:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    h.selectRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('still-valid-access'),
        refreshToken: encryptToken('stored-refresh'),
        accessTokenExpiresAt: future(),
        refreshTokenInvalidGrantCount: 1,
        refreshTokenInvalidGrantFirstAt: new Date(
          now.getTime() - INVALID_GRANT_CONFIRMATION_GRACE_MS + 1000,
        ),
        scope: null,
      },
    ];

    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'upstream_error' });
    expect(h.refreshEveTokenMock).not.toHaveBeenCalled();
    expect(h.updateSpy).not.toHaveBeenCalled();
    expect(h.logUsageEventMock).not.toHaveBeenCalled();
  });

  it('confirms invalid_grant at exactly 5:00 and clears custody', async () => {
    const now = new Date('2026-07-13T20:05:00.000Z');
    const firstAt = new Date(now.getTime() - INVALID_GRANT_CONFIRMATION_GRACE_MS);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    h.selectRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('old-access'),
        refreshToken: encryptToken('old-refresh'),
        accessTokenExpiresAt: past(),
        refreshTokenInvalidGrantCount: 1,
        refreshTokenInvalidGrantFirstAt: firstAt,
        scope: null,
      },
    ];
    h.refreshEveTokenMock.mockResolvedValue({
      kind: 'dead',
      failureClass: 'invalid_grant',
    });

    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'reauth_required' });
    expect(h.refreshEveTokenMock).toHaveBeenCalledTimes(1);
    const cleared = h.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(cleared.accessToken).toBeNull();
    expect(cleared.refreshToken).toBeNull();
    expect(cleared.accessTokenExpiresAt).toBeNull();
    expect(cleared.refreshTokenInvalidGrantCount).toBe(2);
    expect(cleared).not.toHaveProperty('refreshTokenInvalidGrantFirstAt');
    expect(h.emitDomainEventMock).toHaveBeenCalledWith({
      eventType: 'eve_token_state_changed',
      metadata: {
        characterId: CHAR_ID,
        from: 'suspect',
        to: 'reauth_required',
        reason: 'invalid_grant',
      },
    });
  });

  it('forces a post-window refresh and resets the strike on success', async () => {
    const now = new Date('2026-07-13T20:05:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    h.selectRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('still-valid-access'),
        refreshToken: encryptToken('old-refresh'),
        accessTokenExpiresAt: future(),
        refreshTokenInvalidGrantCount: 1,
        refreshTokenInvalidGrantFirstAt: new Date(
          now.getTime() - INVALID_GRANT_CONFIRMATION_GRACE_MS,
        ),
        scope: 'publicData',
      },
    ];
    h.refreshEveTokenMock.mockResolvedValue({
      kind: 'ok',
      access_token: 'recovered-access',
      refresh_token: 'recovered-refresh',
      expires_in: 1200,
    });

    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toMatchObject({
      kind: 'ok',
      accessToken: 'recovered-access',
    });
    expect(h.refreshEveTokenMock).toHaveBeenCalledTimes(1);
    const persisted = h.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(persisted.refreshTokenInvalidGrantCount).toBe(0);
    expect(persisted.refreshTokenInvalidGrantFirstAt).toBeNull();
    expect(h.emitDomainEventMock).toHaveBeenCalledWith({
      eventType: 'eve_token_state_changed',
      metadata: {
        characterId: CHAR_ID,
        from: 'suspect',
        to: 'usable',
        reason: 'refresh_recovered',
      },
    });
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
    expect(h.emitDomainEventMock).not.toHaveBeenCalled();
  });

  it('on a lost first-strike CAS, logs the race signal and reflects a fresh winner', async () => {
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
      kind: 'dead',
      failureClass: 'invalid_grant',
    });
    h.updateReturning = []; // 0 rows: a concurrent winner rotated before our strike landed
    h.rereadRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('winner-access'),
        refreshToken: encryptToken('winner-refresh'),
        accessTokenExpiresAt: future(),
        refreshTokenInvalidGrantCount: 0,
        refreshTokenInvalidGrantFirstAt: null,
        scope: null,
      },
    ];

    const result = await getFreshAccessTokenForCharacter(CHAR_ID);
    expect(result).toMatchObject({ kind: 'ok', accessToken: 'winner-access' });
    expect(h.logUsageEventMock).toHaveBeenCalledTimes(2);
    expect(h.emitDomainEventMock).not.toHaveBeenCalled();
    expect(h.logUsageEventMock).toHaveBeenCalledWith({
      action: 'eve_token_refresh_invalid_grant',
      characterId: CHAR_ID,
      metadata: { failureClass: 'invalid_grant' },
    });
    expect(h.logUsageEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'eve_token_refresh_race', characterId: CHAR_ID }),
    );
  });

  it('reflects upstream_error when a lost first-strike CAS re-reads strike 1', async () => {
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
      kind: 'dead',
      failureClass: 'invalid_grant',
    });
    h.updateReturning = [];
    h.rereadRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('old-access'),
        refreshToken: encryptToken('old-refresh'),
        accessTokenExpiresAt: past(),
        refreshTokenInvalidGrantCount: 1,
        refreshTokenInvalidGrantFirstAt: new Date(),
        scope: null,
      },
    ];

    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'upstream_error' });
    expect(h.logUsageEventMock).toHaveBeenCalledTimes(2);
  });

  it('on a lost confirmation CAS, logs the race signal and reflects a fresh winner', async () => {
    h.selectRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('old-access'),
        refreshToken: encryptToken('old-refresh'),
        accessTokenExpiresAt: past(),
        refreshTokenInvalidGrantCount: 1,
        refreshTokenInvalidGrantFirstAt: new Date(
          Date.now() - INVALID_GRANT_CONFIRMATION_GRACE_MS,
        ),
        scope: null,
      },
    ];
    h.refreshEveTokenMock.mockResolvedValue({
      kind: 'dead',
      failureClass: 'invalid_grant',
    });
    h.updateReturning = [];
    h.rereadRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('winner-access'),
        refreshToken: encryptToken('winner-refresh'),
        accessTokenExpiresAt: future(),
        refreshTokenInvalidGrantCount: 0,
        refreshTokenInvalidGrantFirstAt: null,
        scope: null,
      },
    ];

    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toMatchObject({
      kind: 'ok',
      accessToken: 'winner-access',
    });
    expect(h.logUsageEventMock).toHaveBeenCalledTimes(2);
  });

  it('returns reauth_required when a lost-race re-read finds the account genuinely tokenless', async () => {
    h.selectRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('old-access'),
        refreshToken: encryptToken('old-refresh'),
        accessTokenExpiresAt: past(),
        refreshTokenInvalidGrantCount: 1,
        refreshTokenInvalidGrantFirstAt: new Date(
          Date.now() - INVALID_GRANT_CONFIRMATION_GRACE_MS,
        ),
        scope: null,
      },
    ];
    h.refreshEveTokenMock.mockResolvedValue({
      kind: 'dead',
      failureClass: 'invalid_grant',
    });
    h.updateReturning = [];
    h.rereadRows = [
      {
        id: 'acc1',
        accessToken: null,
        refreshToken: null,
        accessTokenExpiresAt: null,
        refreshTokenInvalidGrantCount: 2,
        refreshTokenInvalidGrantFirstAt: new Date(
          Date.now() - INVALID_GRANT_CONFIRMATION_GRACE_MS,
        ),
        scope: null,
      },
    ];

    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'reauth_required' });
    // The class event and race signal both fire; the re-read just found no token.
    expect(h.logUsageEventMock).toHaveBeenCalledTimes(2);
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

  it.each([
    ['timeout', 'eve_token_refresh_timeout'],
    ['connection', 'eve_token_refresh_connection'],
    ['provider_5xx', 'eve_token_refresh_provider_5xx'],
    ['unexpected', 'eve_token_refresh_unexpected'],
  ] as const)(
    'preserves custody, re-arms grace, and emits the %s action during confirmation',
    async (failureClass, action) => {
      h.selectRows = [
        {
          id: 'acc1',
          accessToken: encryptToken('old-access'),
          refreshToken: encryptToken('old-refresh'),
          accessTokenExpiresAt: past(),
          refreshTokenInvalidGrantCount: 1,
          refreshTokenInvalidGrantFirstAt: new Date(
            Date.now() - INVALID_GRANT_CONFIRMATION_GRACE_MS,
          ),
          scope: null,
        },
      ];
      h.refreshEveTokenMock.mockResolvedValue({ kind: 'retryable', failureClass });

      expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'upstream_error' });
      const deferred = h.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
      expect(deferred.refreshTokenInvalidGrantFirstAt).toEqual(expect.any(Date));
      expect(deferred).not.toHaveProperty('accessToken');
      expect(deferred).not.toHaveProperty('refreshToken');
      expect(h.logUsageEventMock).toHaveBeenCalledWith({
        action,
        characterId: CHAR_ID,
        metadata: { failureClass },
      });
      expect(h.logUsageEventMock).toHaveBeenCalledTimes(1);
    },
  );

  it('leaves strike state untouched for a retryable failure before any invalid_grant', async () => {
    h.selectRows = [
      {
        id: 'acc1',
        accessToken: encryptToken('old-access'),
        refreshToken: encryptToken('old-refresh'),
        accessTokenExpiresAt: past(),
        refreshTokenInvalidGrantCount: 0,
        refreshTokenInvalidGrantFirstAt: null,
        scope: null,
      },
    ];
    h.refreshEveTokenMock.mockResolvedValue({
      kind: 'retryable',
      failureClass: 'connection',
    });

    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'upstream_error' });
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it('does not let a rejected telemetry write fail a vend', async () => {
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
      kind: 'retryable',
      failureClass: 'connection',
    });
    h.logUsageEventMock.mockRejectedValueOnce(new Error('telemetry unavailable'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'upstream_error' });
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(
      '[eve-token] telemetry write failed',
      expect.any(Error),
    ));
    consoleSpy.mockRestore();
  });
});
