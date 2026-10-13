import { describe, expect, it } from 'vitest';
import { SITE_TYPES, type SiteType } from './site-taxonomy';
import {
  isHackingSiteType,
  isWaveDrivenSiteType,
  primarySiteIsk,
  SITE_TYPE_DISPLAY_ORDER,
} from './site-type';

describe('SITE_TYPE_DISPLAY_ORDER', () => {
  it('lists every site type once, combat first and the hacking sites last', () => {
    expect([...SITE_TYPE_DISPLAY_ORDER].sort()).toEqual([...SITE_TYPES].sort());
    expect(SITE_TYPE_DISPLAY_ORDER).toEqual(['combat', 'ore', 'gas', 'relic', 'data']);
  });
});

const EXPECTED_KIND = {
  combat: { waveDriven: true, hacking: false },
  gas: { waveDriven: false, hacking: false },
  ore: { waveDriven: false, hacking: false },
  relic: { waveDriven: true, hacking: true },
  data: { waveDriven: true, hacking: true },
} satisfies Record<SiteType, { waveDriven: boolean; hacking: boolean }>;

describe('site-type predicates', () => {
  it.each(SITE_TYPES)('sorts %s into the wave-driven and hacking groups', (type) => {
    expect(isWaveDrivenSiteType(type)).toBe(EXPECTED_KIND[type].waveDriven);
    expect(isHackingSiteType(type)).toBe(EXPECTED_KIND[type].hacking);
  });
});

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
