import { describe, expect, it } from 'vitest';
import { EVE_SCOPES } from '@/features/auth/eve-sso';
import { DEV_ESI_ENDPOINT_IDS, DEV_ESI_ENDPOINTS } from './api-contract';

describe('DEV_ESI_ENDPOINTS', () => {
  // The sandbox reads only what the least-privilege EVE_SCOPES set requests — a
  // section that demands a scope sign-in doesn't request would 403 forever and
  // read as an ESI quirk instead of the config drift it is (the 3.4.1a failure
  // shape).
  it('only references scopes that sign-in actually requests', () => {
    for (const id of DEV_ESI_ENDPOINT_IDS) {
      expect(
        (EVE_SCOPES as readonly string[]).includes(DEV_ESI_ENDPOINTS[id].scope),
        `${id} demands ${DEV_ESI_ENDPOINTS[id].scope}, which EVE_SCOPES does not request`,
      ).toBe(true);
    }
  });

  it('templates {characterId} and no longer any planet drill-in', () => {
    for (const id of DEV_ESI_ENDPOINT_IDS) {
      const config = DEV_ESI_ENDPOINTS[id];
      expect(config.pathTemplate.includes('{characterId}')).toBe(true);
      expect(config.pathTemplate.includes('{planetId}')).toBe(false);
    }
  });
});
