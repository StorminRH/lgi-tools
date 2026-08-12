import { describe, expect, it } from 'vitest';
import {
  atlasMapQueryPresent,
  mapDeletionHref,
  mapSelectionHref,
} from './map-navigation';

describe('map navigation', () => {
  it('treats a present map query, including an empty value, as selected', () => {
    expect(atlasMapQueryPresent(undefined)).toBe(false);
    expect(atlasMapQueryPresent('')).toBe(true);
    expect(atlasMapQueryPresent('map-a')).toBe(true);
    expect(atlasMapQueryPresent(['map-a'])).toBe(true);
  });

  it('preserves unrelated query keys when selecting a map', () => {
    expect(
      mapSelectionHref('/atlas', new URLSearchParams('tab=scanner'), 'map-a'),
    ).toBe('/atlas?tab=scanner&map=map-a');
  });

  it('drops the current map from the landing href and keeps other query keys', () => {
    expect(mapDeletionHref(new URLSearchParams('map=map-a'), 'map-a')).toBe('/atlas');
    expect(
      mapDeletionHref(new URLSearchParams('map=map-a&tab=scanner'), 'map-a'),
    ).toBe('/atlas?tab=scanner');
  });

  it('returns null when the deleted map is not the URL target', () => {
    expect(mapDeletionHref(new URLSearchParams('map=map-a'), 'map-b')).toBeNull();
    expect(mapDeletionHref(new URLSearchParams(), 'map-a')).toBeNull();
  });
});
