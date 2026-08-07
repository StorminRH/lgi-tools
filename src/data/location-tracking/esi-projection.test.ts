import { describe, expect, it } from 'vitest';
import { parseLocationBody, parseOnlineBody, parseShipBody } from './esi-projection';

describe('parseLocationBody', () => {
  it('parses in-space location (system only)', () => {
    expect(parseLocationBody({ solar_system_id: 30_000_142 })).toEqual({
      solarSystemId: 30_000_142,
      stationId: null,
      structureId: null,
    });
  });

  it('parses docked station and structure ids', () => {
    expect(
      parseLocationBody({
        solar_system_id: 30_000_142,
        station_id: 60_003_760,
        structure_id: 1_027_847_401_201,
      }),
    ).toEqual({
      solarSystemId: 30_000_142,
      stationId: 60_003_760,
      structureId: 1_027_847_401_201,
    });
  });

  it('returns null on a shape mismatch', () => {
    expect(parseLocationBody({ system_id: 30_000_142 })).toBeNull();
    expect(parseLocationBody(null)).toBeNull();
  });
});

describe('parseShipBody', () => {
  it('returns ship_type_id and ignores unrelated fields', () => {
    expect(
      parseShipBody({
        ship_type_id: 670,
        ship_item_id: 1,
        ship_name: 'Capsule',
      }),
    ).toBe(670);
  });

  it('returns null on a shape mismatch', () => {
    expect(parseShipBody({ type_id: 670 })).toBeNull();
    expect(parseShipBody(null)).toBeNull();
  });
});

describe('parseOnlineBody', () => {
  it('returns the online flag and strips the login-history fields', () => {
    expect(
      parseOnlineBody({
        online: true,
        last_login: '2026-08-07T00:00:00Z',
        last_logout: '2026-08-06T00:00:00Z',
        logins: 42,
      }),
    ).toBe(true);
    expect(parseOnlineBody({ online: false })).toBe(false);
  });

  it('returns null on a shape mismatch', () => {
    expect(parseOnlineBody({ online: 'yes' })).toBeNull();
    expect(parseOnlineBody(null)).toBeNull();
  });
});
