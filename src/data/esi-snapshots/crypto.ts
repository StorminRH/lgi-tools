import { decodeAes256Key, encryptAes256Gcm } from '@/lib/aes-gcm';
import { requireEnv } from '@/lib/env';

let cachedKey: Buffer | undefined;

function key(): Buffer {
  cachedKey ??= decodeAes256Key(
    requireEnv('ESI_SNAPSHOT_ENCRYPTION_KEY'),
    'ESI_SNAPSHOT_ENCRYPTION_KEY',
  );
  return cachedKey;
}

/**
 * Serializes and encrypts one raw ESI snapshot body with the application AES-256-GCM layer before
 * database storage.
 */
export function encryptSnapshotBody(body: unknown[]): string {
  return encryptAes256Gcm(JSON.stringify(body), key());
}
