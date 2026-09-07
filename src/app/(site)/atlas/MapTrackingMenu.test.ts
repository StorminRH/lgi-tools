import { createElement, type ReactNode } from 'react';
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
  TrackingControls: ({
    mapId,
    reconnectAction,
  }: {
    mapId: string;
    reconnectAction?: ReactNode;
  }) => createElement('div', { 'data-tracking-map-id': mapId }, reconnectAction),
}));

vi.mock('@/components/composition/account/LinkCharacterButton', () => ({
  LinkCharacterButton: ({ callbackURL }: { callbackURL?: string }) =>
    createElement(
      'button',
      { type: 'button', 'data-reconnect-callback': callbackURL },
      'Reconnect',
    ),
}));

describe('MapTrackingMenu', () => {
  beforeEach(() => {
    mocks.mapId = 'map-a';
  });

  it('passes the query-string map id and the existing reconnect affordance', () => {
    const markup = renderToStaticMarkup(createElement(MapTrackingMenu));
    expect(markup).toContain('data-tracking-map-id="map-a"');
    expect(markup).toContain('data-reconnect-callback="/atlas?map=map-a"');
    expect(markup).toContain('Reconnect');

    for (const mapId of [null, '']) {
      mocks.mapId = mapId;
      expect(renderToStaticMarkup(createElement(MapTrackingMenu))).toBe('');
    }
  });
});
