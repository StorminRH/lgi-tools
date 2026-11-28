import { expect, test } from 'vitest';
import { siteDetail } from './__tests__/site-fixtures';
import { deriveSiteSocialCardContent } from './site-social-card';

test('a social card shows blue loot for a wave-driven site, live resource value for a gas site, and a dash with no value', () => {
  expect(
    deriveSiteSocialCardContent(
      siteDetail({
        name: 'Core Garrison',
        siteType: 'combat',
        wormholeClass: 'C5',
        blueLootIsk: 125_400_000,
      }),
    ),
  ).toEqual({
    name: 'Core Garrison',
    classification: 'C5 · Combat',
    value: '125.4M ISK',
    valueCaption: 'ESTIMATED BLUE-LOOT VALUE',
  });

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

  expect(
    deriveSiteSocialCardContent(siteDetail({ siteType: 'combat', blueLootIsk: null })).value,
  ).toBe('—');
});
