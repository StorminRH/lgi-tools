import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Version prefix written into every AES-256-GCM ciphertext envelope so incompatible formats fail
 * closed during decryption.
 */
export const AES_GCM_ENVELOPE_VERSION = 'v1';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Decodes the configured base64 key and requires exactly 32 bytes before any AES-256 operation is
 * attempted.
 */
export function decodeAes256Key(raw: string, name: string): Buffer {
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== KEY_BYTES) {
    throw new Error(
      `${name} must decode to ${KEY_BYTES} bytes (got ${decoded.length}); ` +
        'generate via `openssl rand -base64 32`',
    );
  }
  return decoded;
}

/**
 * Encrypts UTF-8 plaintext with AES-256-GCM using a fresh 96-bit IV and returns the versioned
 * base64 envelope.
 */
export function encryptAes256Gcm(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    AES_GCM_ENVELOPE_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Authenticates and decrypts a versioned AES-256-GCM envelope; malformed versions, keys, or tags
 * throw without returning plaintext.
 */
export function decryptAes256Gcm(value: string, key: Buffer): string | null {
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== AES_GCM_ENVELOPE_VERSION) return null;
  try {
    const iv = Buffer.from(parts[1]!, 'base64');
    const tag = Buffer.from(parts[2]!, 'base64');
    const ciphertext = Buffer.from(parts[3]!, 'base64');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
