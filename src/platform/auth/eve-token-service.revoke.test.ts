import { beforeEach, describe, expect, it, vi } from 'vitest';

const { chain, state } = vi.hoisted(() => {
  const state = { results: [] as unknown[] };
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(state.results.shift()),
  };
  for (const m of ['select', 'from', 'where', 'limit']) chain[m] = () => chain;
  return { chain, state };
});
vi.mock('@/db', () => ({ db: chain }));

const decryptTokenMock = vi.fn();
vi.mock('./token-crypto', () => ({
  decryptToken: (v: string) => decryptTokenMock(v),
  encryptToken: (v: string) => v,
}));

const revokeEveRefreshTokenMock = vi.fn();
vi.mock('./eve-sso', () => ({
  EVE_PROVIDER_ID: 'eve',
  refreshEveToken: vi.fn(),
  revokeEveRefreshToken: (input: unknown) => revokeEveRefreshTokenMock(input),
}));

vi.mock('@/lib/env', () => ({
  requireEnv: (k: string) => `env:${k}`,
  readEnv: (k: string) => `env:${k}`,
}));
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: vi.fn().mockResolvedValue(undefined),
}));

import { revokeStoredCharacterToken } from './eve-token-service';


beforeEach(() => {
  state.results = [];
  decryptTokenMock.mockReset();
  revokeEveRefreshTokenMock.mockReset();
  revokeEveRefreshTokenMock.mockResolvedValue({ ok: true });
});

describe('revokeStoredCharacterToken', () => {
  it('revokes the decrypted refresh token at EVE with the confidential-client creds', async () => {
    state.results = [[{ id: 'acc-1', refreshToken: 'cipher' }]];
    decryptTokenMock.mockReturnValue('plain-refresh');

    await revokeStoredCharacterToken('cipher');

    expect(decryptTokenMock).toHaveBeenCalledWith('cipher');
    expect(revokeEveRefreshTokenMock).toHaveBeenCalledWith({
      refreshToken: 'plain-refresh',
      clientId: 'env:EVE_CLIENT_ID',
      clientSecret: 'env:EVE_CLIENT_SECRET',
    });
  });

  it('skips the revoke when there is no plaintext refresh token', async () => {
    await revokeStoredCharacterToken(null);
    expect(revokeEveRefreshTokenMock).not.toHaveBeenCalled();

    decryptTokenMock.mockReturnValue(null);
    await revokeStoredCharacterToken('cipher');
    expect(decryptTokenMock).toHaveBeenCalledWith('cipher');
    expect(revokeEveRefreshTokenMock).not.toHaveBeenCalled();
  });

  it('never throws when the revoke itself fails (best-effort — the purge must complete)', async () => {
    state.results = [[{ id: 'acc-1', refreshToken: 'cipher' }]];
    decryptTokenMock.mockReturnValue('plain-refresh');
    revokeEveRefreshTokenMock.mockRejectedValue(new Error('CCP down'));
    await expect(revokeStoredCharacterToken('cipher')).resolves.toBeUndefined();
  });
});
