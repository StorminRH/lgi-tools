import { decodeAes256Key, decryptAes256Gcm, encryptAes256Gcm } from '@/lib/aes-gcm';
import { requireEnv } from '@/lib/env';

let cachedKey: Buffer | undefined;

function key(): Buffer {
  cachedKey ??= decodeAes256Key(
    requireEnv('ESI_SNAPSHOT_ENCRYPTION_KEY'),
    'ESI_SNAPSHOT_ENCRYPTION_KEY',
  );
  return cachedKey;
}

export function encryptSnapshotBody(body: unknown[]): string {
  return encryptAes256Gcm(JSON.stringify(body), key());
}

export function decryptSnapshotBody(ciphertext: string): unknown {
  const plaintext = decryptAes256Gcm(ciphertext, key());
  if (plaintext === null) return null;
  try {
    return JSON.parse(plaintext);
  } catch {
    return null;
  }
}
