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

export function decryptSnapshotBody(ciphertext: string): unknown[] | null {
  const plaintext = decryptAes256Gcm(ciphertext, key());
  if (plaintext === null) return null;
  try {
    const parsed = JSON.parse(plaintext) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
