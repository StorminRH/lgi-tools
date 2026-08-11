import { describe, expect, it } from 'vitest';
import { primarySiteIsk } from './site-primary-isk';

describe('primarySiteIsk', () => {
  it('uses blue loot for wave-driven types and resource totals otherwise', () => {
    expect(
      primarySiteIsk({
        siteType: 'combat',
        blueLootIsk: 12_000_000,
        resourceValueIsk: 1,
      }),
    ).toBe(12_000_000);
    expect(
      primarySiteIsk({
        siteType: 'relic',
        blueLootIsk: 5_000_000,
        resourceValueIsk: 9,
      }),
    ).toBe(5_000_000);
    expect(
      primarySiteIsk({
        siteType: 'data',
        blueLootIsk: 4_000_000,
        resourceValueIsk: 9,
      }),
    ).toBe(4_000_000);
    expect(
      primarySiteIsk({
        siteType: 'gas',
        blueLootIsk: null,
        resourceValueIsk: 82_000_000,
      }),
    ).toBe(82_000_000);
    expect(
      primarySiteIsk({
        siteType: 'ore',
        blueLootIsk: null,
        resourceValueIsk: null,
      }),
    ).toBeNull();
  });
});
