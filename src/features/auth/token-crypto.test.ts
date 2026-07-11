import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A deterministic 32-byte key (base64) for the round-trip cases.
const VALID_KEY = Buffer.alloc(32, 7).toString('base64');

// The module caches the decoded key in module scope, so each test re-imports a
// fresh copy after stubbing the env — that lets the key-validation cases swap in
// a bad key without a stale cache shadowing it.
async function load() {
  return import('./token-crypto');
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('EVE_TOKEN_ENCRYPTION_KEY', VALID_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('encryptToken / decryptToken round-trip', () => {
  it('decrypts what it encrypted', async () => {
    const { encryptToken, decryptToken } = await load();
    expect(decryptToken(encryptToken('refresh-xyz'))).toBe('refresh-xyz');
  });

  it('produces a v1: envelope with four colon-separated parts', async () => {
    const { encryptToken, TOKEN_CRYPTO_VERSION } = await load();
    const enc = encryptToken('some-token');
    expect(enc.startsWith(`${TOKEN_CRYPTO_VERSION}:`)).toBe(true);
    expect(enc.split(':')).toHaveLength(4);
  });

  it('uses a random IV (two encrypts of the same plaintext differ)', async () => {
    const { encryptToken } = await load();
    expect(encryptToken('same')).not.toBe(encryptToken('same'));
  });
});

describe('decryptToken rejects untrusted input', () => {
  it('returns null when the ciphertext is tampered', async () => {
    const { encryptToken, decryptToken } = await load();
    const parts = encryptToken('secret-token').split(':');
    parts[3] = (parts[3]![0] === 'A' ? 'B' : 'A') + parts[3]!.slice(1);
    expect(decryptToken(parts.join(':'))).toBeNull();
  });

  it('returns null when the auth tag is tampered', async () => {
    const { encryptToken, decryptToken } = await load();
    const parts = encryptToken('secret-token').split(':');
    parts[2] = (parts[2]![0] === 'A' ? 'B' : 'A') + parts[2]!.slice(1);
    expect(decryptToken(parts.join(':'))).toBeNull();
  });

  it.each(['', 'notbase64', 'v1:onlyonepart', 'v1:a:b', 'v2:a:b:c', 'plain-legacy-token'])(
    'returns null for malformed/legacy input %j',
    async (value) => {
      const { decryptToken } = await load();
      expect(decryptToken(value)).toBeNull();
    },
  );
});

describe('key validation', () => {
  it('throws when the key is unset', async () => {
    vi.resetModules();
    vi.stubEnv('EVE_TOKEN_ENCRYPTION_KEY', '');
    const { encryptToken } = await import('./token-crypto');
    expect(() => encryptToken('x')).toThrow(/not set/);
  });

  it('throws when the key does not decode to 32 bytes', async () => {
    vi.resetModules();
    vi.stubEnv('EVE_TOKEN_ENCRYPTION_KEY', Buffer.alloc(16, 1).toString('base64'));
    const { encryptToken } = await import('./token-crypto');
    expect(() => encryptToken('x')).toThrow(/32 bytes/);
  });
});
