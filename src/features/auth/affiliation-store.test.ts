import { describe, expect, it } from 'vitest';
import { rowToCachedAffiliation } from './affiliation-store';

describe('rowToCachedAffiliation', () => {
  it('maps every affiliation field, keyed by the given character id', () => {
    expect(
      rowToCachedAffiliation(90000001, {
        corporationId: 98000001,
        allianceId: 99000001,
        factionId: 500001,
        refreshedAt: new Date('2026-07-10T00:00:00Z'),
      }),
    ).toEqual({
      characterId: 90000001,
      corporationId: 98000001,
      allianceId: 99000001,
      factionId: 500001,
      refreshedAt: new Date('2026-07-10T00:00:00Z'),
    });
  });

  it('coalesces every missing field to null (fail-closed)', () => {
    expect(
      rowToCachedAffiliation(90000001, {
        corporationId: null,
        allianceId: null,
        factionId: null,
        refreshedAt: null,
      }),
    ).toEqual({
      characterId: 90000001,
      corporationId: null,
      allianceId: null,
      factionId: null,
      refreshedAt: null,
    });
  });
});
