import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted so the vi.mock factories below can close over them.
const h = vi.hoisted(() => ({
  selectRows: [] as Record<string, unknown>[],
  updateSpy: vi.fn(),
  refreshEveTokenMock: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(h.selectRows),
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          h.updateSpy(vals);
          return Promise.resolve([]);
        },
      }),
    }),
  },
}));

vi.mock('./eve-sso', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./eve-sso')>();
  return { ...actual, refreshEveToken: h.refreshEveTokenMock };
});

// Real crypto with a deterministic key, so we can assert ciphertext shape.
const VALID_KEY = Buffer.alloc(32, 9).toString('base64');

import { EVE_SCOPES } from './eve-sso';
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
  h.updateSpy.mockClear();
  h.refreshEveTokenMock.mockReset();
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
    expect(result).toMatchObject({ kind: 'ok', accessToken: 'cached-access', scopes: [...EVE_SCOPES] });
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
    const persisted = h.updateSpy.mock.calls[0][0] as { accessToken: string; refreshToken: string };
    expect(persisted.refreshToken.startsWith('v1:')).toBe(true);
    expect(persisted.accessToken.startsWith('v1:')).toBe(true);
    expect(decryptToken(persisted.refreshToken)).toBe('new-refresh');
    expect(decryptToken(persisted.accessToken)).toBe('new-access');
  });

  it('nulls token custody and returns reauth_required on a dead refresh token', async () => {
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

    expect(await getFreshAccessTokenForCharacter(CHAR_ID)).toEqual({ kind: 'reauth_required' });
    const cleared = h.updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(cleared.accessToken).toBeNull();
    expect(cleared.refreshToken).toBeNull();
    expect(cleared.accessTokenExpiresAt).toBeNull();
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
