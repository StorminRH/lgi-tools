import { expect, it } from 'vitest';
import {
  atlasMapQueryPresent,
  atlasSignInReturnHref,
  mapDeletionHref,
  mapSelectionHref,
} from './map-navigation';

it('selects maps through the query string and lands safely after deleting the current one', () => {
  expect(atlasMapQueryPresent(undefined)).toBe(false);
  expect(atlasMapQueryPresent('')).toBe(true);
  expect(atlasMapQueryPresent('map-a')).toBe(true);
  expect(atlasMapQueryPresent(['map-a'])).toBe(true);

  expect(
    mapSelectionHref('/atlas', new URLSearchParams('tab=scanner'), 'map-a'),
  ).toBe('/atlas?tab=scanner&map=map-a');
  expect(
    mapSelectionHref(
      '/atlas',
      new URLSearchParams('map=old&panel=signatures'),
      'map/one',
    ),
  ).toBe('/atlas?map=map%2Fone&panel=signatures');

  expect(mapDeletionHref(new URLSearchParams('map=map-a'), 'map-a')).toBe('/atlas');
  expect(
    mapDeletionHref(new URLSearchParams('map=map-a&tab=scanner'), 'map-a'),
  ).toBe('/atlas?tab=scanner');
  expect(mapDeletionHref(new URLSearchParams('map=map-a'), 'map-b')).toBeNull();
  expect(mapDeletionHref(new URLSearchParams(), 'map-a')).toBeNull();
});

it('returns a signed-out sign-in to the shared map and nothing else', () => {
  expect(atlasSignInReturnHref(undefined)).toBe('/atlas');
  expect(atlasSignInReturnHref('')).toBe('/atlas');
  expect(atlasSignInReturnHref('map/one')).toBe('/atlas?map=map%2Fone');
  expect(atlasSignInReturnHref(['map/one', 'ignored'])).toBe('/atlas?map=map%2Fone');
});
