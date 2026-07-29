import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkAdmin = vi.fn();

vi.mock('@/platform/auth/route-guards', () => ({
  checkAdmin: () => checkAdmin(),
}));

vi.mock('@/components/composition/map/MapChrome', () => ({
  MapChrome: () => createElement('div', { 'data-map-chrome': 'true' }),
}));

describe('(map) layout admin gate', () => {
  beforeEach(() => {
    vi.resetModules();
    checkAdmin.mockReset();
  });

  it('renders the wall and omits the canvas for a non-admin', async () => {
    checkAdmin.mockResolvedValue({
      ok: false,
      failure: { kind: 'forbidden' },
    });
    const { MapAdminGate } = await import('./layout');
    const html = renderToStaticMarkup(
      createElement(
        'div',
        null,
        await MapAdminGate({
          children: createElement('div', { 'data-map-canvas': 'true' }),
        }),
      ),
    );
    expect(html).toContain('Under development');
    expect(html).toContain('Map not yet cleared for public undock');
    expect(html).not.toContain('data-map-canvas');
    expect(html).not.toContain('data-map-chrome');
  });

  it('renders chrome and the canvas marker for an admin', async () => {
    checkAdmin.mockResolvedValue({
      ok: true,
      session: {
        characterId: 42,
        name: 'Admin',
        portraitUrl: 'https://example.test/p.png',
        role: 'ADMIN',
        isAdmin: true,
      },
    });
    const { MapAdminGate } = await import('./layout');
    const html = renderToStaticMarkup(
      createElement(
        'div',
        null,
        await MapAdminGate({
          children: createElement('div', { 'data-map-canvas': 'true' }),
        }),
      ),
    );
    expect(html).toContain('data-map-chrome');
    expect(html).toContain('data-map-canvas');
    expect(html).not.toContain('Under development');
  });

  it('uses a full-viewport overflow-hidden frame', async () => {
    const { default: MapLayout } = await import('./layout');
    const html = renderToStaticMarkup(
      createElement(MapLayout, null, createElement('div') as ReactNode),
    );
    expect(html).toContain('h-[100dvh]');
    expect(html).toContain('overflow-hidden');
  });
});
