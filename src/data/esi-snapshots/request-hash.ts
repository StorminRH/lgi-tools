import { createHash } from 'node:crypto';

export function snapshotRequestHash(endpoint: string, sourceVersion: string): string {
  const canonical = JSON.stringify({ method: 'GET', endpoint, sourceVersion });
  return createHash('sha256').update(canonical).digest('hex');
}
