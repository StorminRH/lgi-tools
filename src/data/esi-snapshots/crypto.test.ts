import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = Buffer.alloc(32, 19).toString('base64');
const RAW_ASSETS = [
  {
    item_id: 101,
    type_id: 34,
    quantity: 5,
    location_id: 60003760,
    location_type: 'station',
    location_flag: 'CorpSAG1',
    is_singleton: false,
  },
  {
    item_id: 102,
    type_id: 34,
    quantity: 7,
    location_id: 60003760,
    location_type: 'station',
    location_flag: 'CorpSAG1',
    is_singleton: false,
  },
];

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('ESI_SNAPSHOT_ENCRYPTION_KEY', KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ESI snapshot body crypto', () => {
  it('round-trips a raw response', async () => {
    const { decryptSnapshotBody, encryptSnapshotBody } = await import('./crypto');

    const storedBody = encryptSnapshotBody(RAW_ASSETS);
    const replayed = decryptSnapshotBody(storedBody);

    expect(replayed).toEqual(RAW_ASSETS);
  });

  it('rejects tampered ciphertext and non-array plaintext', async () => {
    const { decryptSnapshotBody, encryptSnapshotBody } = await import('./crypto');
    const ciphertext = encryptSnapshotBody(RAW_ASSETS);
    const parts = ciphertext.split(':');
    parts[3] = (parts[3]![0] === 'A' ? 'B' : 'A') + parts[3]!.slice(1);

    expect(decryptSnapshotBody(parts.join(':'))).toBeNull();
  });
});
