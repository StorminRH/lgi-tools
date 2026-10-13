import { expect, expectTypeOf, test } from 'vitest';
import { siteResource } from './__tests__/site-fixtures';
import { isLivePricedResource } from './live-isk';
import type { SiteResource } from './types';

const gas = (over: Partial<SiteResource>): SiteResource =>
  siteResource({ resourceKind: 'gas', typeId: 30370, units: 1_000, liveEligible: true, ...over });

test('isLivePricedResource needs the live flag, a type id and a positive unit count, and narrows them', () => {
  expect(isLivePricedResource(gas({ liveEligible: false }))).toBe(false);
  expect(isLivePricedResource(gas({ typeId: null }))).toBe(false);
  expect(isLivePricedResource(gas({ units: null }))).toBe(false);
  expect(isLivePricedResource(gas({ units: 0 }))).toBe(false);
  expect(isLivePricedResource(gas({ units: -5 }))).toBe(false);

  const resource = gas({});
  expect(isLivePricedResource(resource)).toBe(true);
  if (isLivePricedResource(resource)) {
    expectTypeOf(resource.typeId).toEqualTypeOf<number>();
    expectTypeOf(resource.units).toEqualTypeOf<number>();
    expect([resource.typeId, resource.units]).toEqual([30370, 1_000]);
  }
});
