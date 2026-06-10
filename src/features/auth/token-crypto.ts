// Encryption at rest for EVE OAuth tokens (3.4.1b). The access + refresh tokens
// live in the `account` row, but a refresh token is a long-lived bearer of a
// pilot's ESI access — it must never sit in the database as plaintext and must
// never leave Neon. We encrypt with a DEDICATED 32-byte key
// (EVE_TOKEN_ENCRYPTION_KEY) kept separate from BETTER_AUTH_SECRET so token
// custody has its own blast radius: rotating one doesn't invalidate the other.
//
// AES-256-GCM gives confidentiality + integrity — the auth tag detects tampering
// or a wrong key, which `decryptToken` surfaces as `null`. Pure module: no DB,
// no next/headers. The key is read lazily on first use so import stays
// side-effect-free, mirroring the lazy `db` Proxy.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { requireEnv } from '@/lib/env';

// Ciphertext envelope version. Bump only alongside a decrypt path for the old
// format; `decryptToken` rejects any other prefix.
export const TOKEN_CRYPTO_VERSION = 'v1';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard nonce length
const KEY_BYTES = 32; // AES-256

let cachedKey: Buffer | undefined;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = requireEnv('EVE_TOKEN_ENCRYPTION_KEY');
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== KEY_BYTES) {
    throw new Error(
      `EVE_TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${decoded.length}); ` +
        'generate via `openssl rand -base64 32`',
    );
  }
  cachedKey = decoded;
  return cachedKey;
}

// Encrypt a token for storage. Output: `v1:<b64 iv>:<b64 tag>:<b64 ciphertext>`.
// Base64 never contains ':', so the four parts split unambiguously on read.
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    TOKEN_CRYPTO_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

// Decrypt a stored token. Returns `null` for anything that isn't a valid `v1`
// ciphertext this key can authenticate: a tampered or garbage value, or a legacy
// plaintext token (no `v1:` prefix). Callers treat `null` as "needs reconnect" —
// we never forward an unverified value as if it were a live token. A missing or
// wrong-length key is a deployment misconfiguration, not a per-token condition,
// so `key()` throws rather than masking it as `null`.
export function decryptToken(value: string): string | null {
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== TOKEN_CRYPTO_VERSION) return null;
  const k = key();
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ciphertext = Buffer.from(parts[3], 'base64');
    const decipher = createDecipheriv(ALGORITHM, k, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
