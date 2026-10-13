import { describe, expect, it } from 'vitest';
import { siteDetail } from './__tests__/site-fixtures';
import { deriveSiteSocialCardContent } from './site-social-card';

describe('deriveSiteSocialCardContent', () => {
  it('uses blue loot for wave-driven sites', () => {
    const coreGarrison = siteDetail({
      name: 'Core Garrison',
      siteType: 'combat',
      wormholeClass: 'C5',
      blueLootIsk: 125_400_000,
    });
    expect(deriveSiteSocialCardContent(coreGarrison)).toEqual({
      name: 'Core Garrison',
      classification: 'C5 · Combat',
      value: '125.4M ISK',
      valueCaption: 'ESTIMATED BLUE-LOOT VALUE',
    });
  });

  it('uses live resource value for ore and gas sites', () => {
    expect(
      deriveSiteSocialCardContent(
        siteDetail({
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
    expect(
      deriveSiteSocialCardContent(siteDetail({ siteType: 'combat', blueLootIsk: null })).value,
    ).toBe('—');
  });
});
