import { describe, expect, it } from 'vitest';
import crons from './crons';

describe('map retention schedules', () => {
  it.each([
    ['map chain purge', 'mapChainCleanup:purgeExpiredChainTombstones', 24],
    ['map signature purge', 'mapScan:purgeExpiredSignatureTombstones', 24],
    ['map ceiling collapse', 'mapAuthoringSweep:collapseExpiredConnections', 1],
  ] as const)('registers %s for deployment', (identifier, name, hours) => {
    expect(crons.crons[identifier]).toEqual({
      name,
      args: [{}],
      schedule: { type: 'interval', hours },
    });
  });
});
