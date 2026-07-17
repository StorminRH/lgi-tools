import { createHash } from 'node:crypto';

/**
 * Hashes a normalized ESI method, path, and body into the stable snapshot request identity;
 * authorization headers are never included.
 */
export function snapshotRequestHash(endpoint: string, sourceVersion: string): string {
  const canonical = JSON.stringify({ method: 'GET', endpoint, sourceVersion });
  return createHash('sha256').update(canonical).digest('hex');
}
