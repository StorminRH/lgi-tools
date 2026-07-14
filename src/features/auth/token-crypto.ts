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

import { requireEnv } from '@/lib/env';
import {
  AES_GCM_ENVELOPE_VERSION,
  decodeAes256Key,
  decryptAes256Gcm,
  encryptAes256Gcm,
} from '@/lib/aes-gcm';

// Ciphertext envelope version. Bump only alongside a decrypt path for the old
// format; `decryptToken` rejects any other prefix.
export const TOKEN_CRYPTO_VERSION = AES_GCM_ENVELOPE_VERSION;

let cachedKey: Buffer | undefined;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = requireEnv('EVE_TOKEN_ENCRYPTION_KEY');
  cachedKey = decodeAes256Key(raw, 'EVE_TOKEN_ENCRYPTION_KEY');
  return cachedKey;
}

// Encrypt a token for storage. Output: `v1:<b64 iv>:<b64 tag>:<b64 ciphertext>`.
// Base64 never contains ':', so the four parts split unambiguously on read.
export function encryptToken(plaintext: string): string {
  return encryptAes256Gcm(plaintext, key());
}

// Decrypt a stored token. Returns `null` for anything that isn't a valid `v1`
// ciphertext this key can authenticate: a tampered or garbage value, or a legacy
// plaintext token (no `v1:` prefix). Callers treat `null` as "needs reconnect" —
// we never forward an unverified value as if it were a live token. A missing or
// wrong-length key is a deployment misconfiguration, not a per-token condition,
// so `key()` throws rather than masking it as `null`.
export function decryptToken(value: string): string | null {
  return decryptAes256Gcm(value, key());
}
