import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapTrackingMenu } from './MapTrackingMenu';

const mocks = vi.hoisted(() => ({
  mapId: 'map-a' as string | null,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => mocks.mapId }),
}));

vi.mock('@/data/convex/client', () => ({
  convexClient: {},
}));

vi.mock('@/mapper', () => ({
  TrackingControls: ({ mapId }: { mapId: string }) =>
    createElement('div', { 'data-tracking-map-id': mapId }),
}));

describe('MapTrackingMenu', () => {
  beforeEach(() => {
    mocks.mapId = 'map-a';
  });

  it('passes the query-string map id to the mapper settings surface and renders nothing without one', () => {
    expect(renderToStaticMarkup(createElement(MapTrackingMenu))).toContain(
      'data-tracking-map-id="map-a"',
    );

    for (const mapId of [null, '']) {
      mocks.mapId = mapId;
      expect(renderToStaticMarkup(createElement(MapTrackingMenu))).toBe('');
    }
  });
});
