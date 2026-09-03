// pilot's ESI access — it must never sit in the database as plaintext and must

import { requireEnv } from '@/lib/env';
import {
  AES_GCM_ENVELOPE_VERSION,
  decodeAes256Key,
  decryptAes256Gcm,
  encryptAes256Gcm,
} from '@/lib/aes-gcm';

export const TOKEN_CRYPTO_VERSION = AES_GCM_ENVELOPE_VERSION;

let cachedKey: Buffer | undefined;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = requireEnv('EVE_TOKEN_ENCRYPTION_KEY');
  cachedKey = decodeAes256Key(raw, 'EVE_TOKEN_ENCRYPTION_KEY');
  return cachedKey;
}

export function encryptToken(plaintext: string): string {
  return encryptAes256Gcm(plaintext, key());
}

export function decryptToken(value: string): string | null {
  return decryptAes256Gcm(value, key());
}
