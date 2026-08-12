import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AtlasCanvasFrame } from './AtlasCanvasFrame';

vi.mock('@/components/composition/map/MapChrome', () => ({
  MapChrome: ({
    session,
    contextualSection,
  }: {
    session: unknown;
    contextualSection?: React.ReactNode;
  }) =>
    createElement(
      'div',
      {
        'data-map-chrome': '',
        'data-map-account-session': String(session != null),
      },
      contextualSection,
    ),
}));

vi.mock('@/mapper', () => ({
  MapCanvas: () => createElement('div', { 'data-map-canvas': '' }),
}));

vi.mock('./MapTrackingMenu', () => ({
  MapTrackingMenu: () => createElement('div', { 'data-map-tracking-menu': '' }),
}));

describe('AtlasCanvasFrame', () => {
  it('covers the site chrome with the clipped canvas overlay', () => {
    const markup = renderToStaticMarkup(
      createElement(AtlasCanvasFrame, {
        session: {
          characterId: 1,
          name: 'Mapper',
          portraitUrl: '/portrait.png',
          role: 'ADMIN',
        },
      }),
    );
    expect(markup).toContain('data-map-canvas-frame');
    expect(markup).toContain('fixed inset-0');
    expect(markup).toContain('overflow-hidden');
    expect(markup).toContain('data-map-chrome');
    expect(markup).toContain('data-map-canvas');
    expect(markup).toContain('data-map-tracking-menu');
    expect(markup).toContain('data-map-account-session="true"');
  });
});
