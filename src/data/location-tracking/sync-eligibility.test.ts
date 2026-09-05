import { expect, test } from 'vitest';
import { LOCATION_SYNC_SCOPES } from './sync-eligibility';

test('LOCATION_SYNC_SCOPES pins the three location ESI scopes', () => {
  expect([...LOCATION_SYNC_SCOPES]).toEqual([
    'esi-location.read_location.v1',
    'esi-location.read_ship_type.v1',
    'esi-location.read_online.v1',
  ]);
});
