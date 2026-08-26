import { expect, test, vi } from 'vitest';
import { encryptAccountTokens } from './account-token-encryption';
import { EVE_PROVIDER_ID } from './eve-sso';
import { TOKEN_CRYPTO_VERSION } from './token-crypto';

const enc = (s: string) => `ENC(${s})`;
const CIPHERTEXT = `${TOKEN_CRYPTO_VERSION}:already-at-rest`;

test('encrypts EVE access and refresh independently, resets strike state, and does not mutate input', () => {
  const input = { providerId: EVE_PROVIDER_ID, accessToken: 'at', refreshToken: 'rt' };
  const out = encryptAccountTokens(input, enc);
  expect(out.accessToken).toBe('ENC(at)');
  expect(out.refreshToken).toBe('ENC(rt)');
  expect(out.refreshTokenInvalidGrantCount).toBe(0);
  expect(out.refreshTokenInvalidGrantFirstAt).toBeNull();
  expect(out).not.toBe(input);
  expect(input.accessToken).toBe('at');

  const noProvider = encryptAccountTokens({ accessToken: 'at', refreshToken: 'rt' }, enc);
  expect(noProvider.accessToken).toBe('ENC(at)');
  expect(noProvider.refreshToken).toBe('ENC(rt)');
  expect(noProvider.refreshTokenInvalidGrantCount).toBe(0);

  const partial = encryptAccountTokens({ accessToken: '', refreshToken: 'rt' }, enc);
  expect(partial.accessToken).toBe('');
  expect(partial.refreshToken).toBe('ENC(rt)');

  const accessOnly = encryptAccountTokens({ accessToken: 'at', refreshToken: null }, enc);
  expect(accessOnly.accessToken).toBe('ENC(at)');
  expect(accessOnly.refreshToken).toBeNull();
  expect(accessOnly).not.toHaveProperty('refreshTokenInvalidGrantCount');
});

test('leaves non-EVE, already-ciphertext, and absent tokens untouched', () => {
  const spy = vi.fn(enc);
  const github = { providerId: 'github', accessToken: 'at', refreshToken: 'rt' };
  expect(encryptAccountTokens(github, spy)).toBe(github);
  expect(spy).not.toHaveBeenCalled();

  const already = encryptAccountTokens({ accessToken: CIPHERTEXT, refreshToken: CIPHERTEXT }, enc);
  expect(already.accessToken).toBe(CIPHERTEXT);
  expect(already.refreshToken).toBe(CIPHERTEXT);

  const absent = encryptAccountTokens({ accessToken: null, refreshToken: undefined }, enc);
  expect(absent.accessToken).toBeNull();
  expect(absent.refreshToken).toBeUndefined();
  expect(absent).not.toHaveProperty('refreshTokenInvalidGrantCount');
  expect(absent).not.toHaveProperty('refreshTokenInvalidGrantFirstAt');

  expect(encryptAccountTokens({ scope: 'publicData', refreshToken: undefined }, enc)).toEqual({
    scope: 'publicData',
    refreshToken: undefined,
  });
});
