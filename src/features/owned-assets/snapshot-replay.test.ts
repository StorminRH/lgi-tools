import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptSnapshotBody, encryptSnapshotBody } from '@/data/esi-snapshots/crypto';
import { parseAssetsBody } from './esi-projection';

const KEY = Buffer.alloc(32, 23).toString('base64');
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
  vi.stubEnv('ESI_SNAPSHOT_ENCRYPTION_KEY', KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('owned-assets snapshot replay', () => {
  it('re-derives the original rows from encrypted raw data with zero ESI calls', () => {
    const readEsi = vi.fn();
    const replayed = decryptSnapshotBody(encryptSnapshotBody(RAW_ASSETS));

    expect(parseAssetsBody(replayed)).toEqual([
      {
        type_id: 34,
        quantity: 12,
        location_id: 60003760,
        location_type: 'station',
        location_flag: 'CorpSAG1',
      },
    ]);
    expect(readEsi).not.toHaveBeenCalled();
  });
});
