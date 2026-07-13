import { describe, expect, it } from 'vitest';
import { deriveSiteSocialCardContent } from './site-social-card';
import type { SiteDetail } from './types';

function site(overrides: Partial<SiteDetail> = {}): SiteDetail {
  return {
    id: 100,
    name: 'Core Garrison',
    siteType: 'combat',
    wormholeClass: 'C5',
    signatureLabel: 'Unsecured Frontier Database',
    sourceTab: 'C5 Combat',
    blueLootIsk: 125_400_000,
    iskPerEhp: null,
    resourceValueIsk: null,
    waves: [],
    resources: [],
    ...overrides,
  };
}

describe('deriveSiteSocialCardContent', () => {
  it('uses blue loot for wave-driven sites', () => {
    expect(deriveSiteSocialCardContent(site())).toEqual({
      name: 'Core Garrison',
      classification: 'C5 · Combat',
      value: '125.4M ISK',
      valueCaption: 'ESTIMATED BLUE-LOOT VALUE',
    });
  });

  it('uses live resource value for ore and gas sites', () => {
    expect(
      deriveSiteSocialCardContent(
        site({
          name: 'Instrumental Core Reservoir',
          siteType: 'gas',
          wormholeClass: null,
          blueLootIsk: null,
          resourceValueIsk: 1_245_000_000,
        }),
      ),
    ).toEqual({
      name: 'Instrumental Core Reservoir',
      classification: 'Wormhole · Gas',
      value: '1.2B ISK',
      valueCaption: 'LIVE JITA RESOURCE VALUE',
    });
  });

  it('keeps the established unavailable-value fallback', () => {
    expect(deriveSiteSocialCardContent(site({ blueLootIsk: null })).value).toBe('—');
  });
});
