import { describe, expect, it, vi } from 'vitest';
import { encryptAccountTokens } from './account-token-encryption';
import { EVE_PROVIDER_ID } from './eve-sso';
import { TOKEN_CRYPTO_VERSION } from './token-crypto';

const enc = (s: string) => `ENC(${s})`;
// A value that already carries the crypto-version prefix — must be left alone.
const CIPHERTEXT = `${TOKEN_CRYPTO_VERSION}:already-at-rest`;

describe('encryptAccountTokens', () => {
  it('encrypts a present access + refresh token via the injected encrypt', () => {
    const out = encryptAccountTokens(
      { providerId: EVE_PROVIDER_ID, accessToken: 'at', refreshToken: 'rt' },
      enc,
    );
    expect(out.accessToken).toBe('ENC(at)');
    expect(out.refreshToken).toBe('ENC(rt)');
  });

  it('still encrypts when providerId is absent (the EVE re-login update path)', () => {
    const out = encryptAccountTokens({ accessToken: 'at', refreshToken: 'rt' }, enc);
    expect(out.accessToken).toBe('ENC(at)');
    expect(out.refreshToken).toBe('ENC(rt)');
  });

  it('returns the data untouched for a positively non-EVE provider', () => {
    const spy = vi.fn(enc);
    const input = { providerId: 'github', accessToken: 'at', refreshToken: 'rt' };
    const out = encryptAccountTokens(input, spy);
    expect(out).toBe(input); // same reference — no copy, no encryption
    expect(spy).not.toHaveBeenCalled();
  });

  it('skips an empty-string token but still encrypts the other', () => {
    const out = encryptAccountTokens({ accessToken: '', refreshToken: 'rt' }, enc);
    expect(out.accessToken).toBe('');
    expect(out.refreshToken).toBe('ENC(rt)');
  });

  it('is idempotent — leaves an already-ciphertext value alone', () => {
    const out = encryptAccountTokens({ accessToken: CIPHERTEXT, refreshToken: CIPHERTEXT }, enc);
    expect(out.accessToken).toBe(CIPHERTEXT);
    expect(out.refreshToken).toBe(CIPHERTEXT);
  });

  it('leaves null / undefined tokens untouched', () => {
    const out = encryptAccountTokens({ accessToken: null, refreshToken: undefined }, enc);
    expect(out.accessToken).toBeNull();
    expect(out.refreshToken).toBeUndefined();
  });

  it('handles access and refresh independently', () => {
    const out = encryptAccountTokens({ accessToken: 'at', refreshToken: null }, enc);
    expect(out.accessToken).toBe('ENC(at)');
    expect(out.refreshToken).toBeNull();
  });

  it('does not mutate the input object when it encrypts', () => {
    const input = { accessToken: 'at', refreshToken: 'rt' };
    const out = encryptAccountTokens(input, enc);
    expect(out).not.toBe(input);
    expect(input.accessToken).toBe('at'); // original left plaintext
  });
});
