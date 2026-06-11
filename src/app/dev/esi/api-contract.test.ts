import { describe, expect, it } from 'vitest';
import { EVE_SCOPES } from '@/features/auth/eve-sso';
import { DEV_ESI_ENDPOINT_IDS, DEV_ESI_ENDPOINTS } from './api-contract';

describe('DEV_ESI_ENDPOINTS', () => {
  // The sandbox exists to prove the 3.4.6 scope superset — a section that
  // demands a scope sign-in doesn't request would 403 forever and read as an
  // ESI quirk instead of the config drift it is (the 3.4.1a failure shape).
  it('only references scopes that sign-in actually requests', () => {
    for (const id of DEV_ESI_ENDPOINT_IDS) {
      expect(
        (EVE_SCOPES as readonly string[]).includes(DEV_ESI_ENDPOINTS[id].scope),
        `${id} demands ${DEV_ESI_ENDPOINTS[id].scope}, which EVE_SCOPES does not request`,
      ).toBe(true);
    }
  });

  it('templates {planetId} exactly where needsPlanetId says so', () => {
    for (const id of DEV_ESI_ENDPOINT_IDS) {
      const config = DEV_ESI_ENDPOINTS[id];
      expect(config.pathTemplate.includes('{planetId}')).toBe(
        config.needsPlanetId === true,
      );
      expect(config.pathTemplate.includes('{characterId}')).toBe(true);
    }
  });
});
