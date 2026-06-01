import { afterEach, describe, expect, it, vi } from 'vitest';
import { base64UrlToBytes } from './session';

// `base64UrlToBytes` is the Buffer-free decode that turns SESSION_SECRET into
// the 32-byte JWE key — the Edge-readiness swap for `Buffer.from(s,
// 'base64url')`. Validate it against Node's reference encoder and prove the
// decoded key still drives a jose encrypt/decrypt round trip.

describe('base64UrlToBytes', () => {
  it('round-trips arbitrary bytes against Node base64url', () => {
    const bytes = new Uint8Array(32).map((_, i) => (i * 37 + 11) % 256);
    const b64url = Buffer.from(bytes).toString('base64url');
    expect(base64UrlToBytes(b64url)).toEqual(bytes);
  });

  it('decodes the base64url-specific `-` and `_` alphabet', () => {
    // 0xfb,0xff,0xbf encode to base64 `+/+/` → base64url `-_-_` (no padding).
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf]);
    const b64url = Buffer.from(bytes).toString('base64url');
    expect(b64url).toContain('-');
    expect(b64url).toContain('_');
    expect(base64UrlToBytes(b64url)).toEqual(bytes);
  });
});

describe('sessionKey via encrypt/decrypt', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules(); // sessionKey caches the decoded key at module scope
  });

  it('encrypts then decrypts with a valid 32-byte base64url secret', async () => {
    const secret = Buffer.from(new Uint8Array(32).fill(7)).toString('base64url');
    vi.stubEnv('SESSION_SECRET', secret);
    const { encryptSession, decryptSession } = await import('./session');
    const jwe = await encryptSession({ characterId: 90000001 });
    expect(typeof jwe).toBe('string');
    await expect(decryptSession(jwe)).resolves.toEqual({ characterId: 90000001 });
  });

  it('rejects a secret that decodes to the wrong length', async () => {
    const tooShort = Buffer.from(new Uint8Array(16).fill(1)).toString('base64url');
    vi.stubEnv('SESSION_SECRET', tooShort);
    const { encryptSession } = await import('./session');
    await expect(encryptSession({ characterId: 1 })).rejects.toThrow(/32 bytes/);
  });
});
