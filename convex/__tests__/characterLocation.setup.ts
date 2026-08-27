import { type TestConvex } from 'convex-test';
import schema from '../schema';

export const USER = 'user-location-1';
export const OTHER = 'user-location-other';
export const CHAR_A = 90_000_101;
export const CHAR_B = 90_000_102;
export const GEN = 1_700_000_000_000;

export function locationDoc(userId: string, characterId: number) {
  return {
    userId,
    characterId,
    solarSystemId: 30_000_142,
    stationId: null as number | null,
    structureId: null as number | null,
    shipTypeId: 670 as number | null,
    prevSolarSystemId: null as number | null,
    prevFresh: false,
    transitionObservedAt: 1_699_999_999_000,
    observedAt: 1_700_000_000_000,
    etagLocation: 'loc' as string | null,
    etagShip: 'ship' as string | null,
  };
}

export function accessLease(userId: string, characterId: number) {
  return {
    userId,
    characterId,
    accessToken: `tok-${characterId}`,
    expiresAt: GEN + 1_200_000,
    updatedAt: GEN,
  };
}

export function readDoc(t: TestConvex<typeof schema>, characterId = CHAR_A) {
  return t.run((ctx) =>
    ctx.db
      .query('characterLocation')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  );
}
