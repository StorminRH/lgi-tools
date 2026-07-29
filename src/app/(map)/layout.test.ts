import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapLayout, { MapAccessGate } from './layout';

const mocks = vi.hoisted(() => ({
  checkAdmin: vi.fn(),
}));

vi.mock('@/platform/auth/route-guards', () => ({
  checkAdmin: mocks.checkAdmin,
}));

vi.mock('@/components/composition/map/MapChrome', () => ({
  MapChrome: ({ session: value }: { session: unknown }) =>
    createElement('div', {
      'data-map-chrome': '',
      'data-map-account-session': String(value != null),
    }),
}));

const session = {
  characterId: 1,
  name: 'Mapper',
  portraitUrl: '/portrait.png',
  role: 'ADMIN',
};

describe('MapAccessGate', () => {
  beforeEach(() => {
    mocks.checkAdmin.mockReset();
  });

  it('renders the development wall without the canvas for a non-admin', async () => {
    mocks.checkAdmin.mockResolvedValue({ ok: false, failure: { code: 'forbidden' } });

    const result = await MapAccessGate({
      children: createElement('div', { 'data-map-canvas': '' }),
    });
    const markup = renderToStaticMarkup(result);

    expect(markup).toContain('data-map-development-wall');
    expect(markup).toContain('under development');
    expect(markup).not.toContain('data-map-canvas');
    expect(markup).not.toContain('data-map-chrome');
  });

  it('renders floating chrome and the canvas subtree for an admin', async () => {
    mocks.checkAdmin.mockResolvedValue({ ok: true, session });

    const result = await MapAccessGate({
      children: createElement('div', { 'data-map-canvas': '' }),
    });
    const markup = renderToStaticMarkup(result);

    expect(markup).toContain('data-map-chrome');
    expect(markup).toContain('data-map-canvas');
    expect(markup).not.toContain('data-map-development-wall');
  });

  it('keeps the canvas available when an authorized user has no active character', async () => {
    mocks.checkAdmin.mockResolvedValue({
      ok: true,
      session: { ...session, characterId: null },
    });

    const result = await MapAccessGate({
      children: createElement('div', { 'data-map-canvas': '' }),
    });
    const markup = renderToStaticMarkup(result);

    expect(markup).toContain('data-map-chrome');
    expect(markup).toContain('data-map-account-session="false"');
    expect(markup).toContain('data-map-canvas');
    expect(markup).not.toContain('data-map-development-wall');
  });
});

describe('MapLayout', () => {
  it('owns the full viewport frame and clips canvas overflow', () => {
    const frame = MapLayout({
      children: createElement('div', { 'data-map-canvas': '' }),
    });

    expect(frame.props.className).toContain('relative');
    expect(frame.props.className).toContain('h-[100dvh]');
    expect(frame.props.className).toContain('w-full');
    expect(frame.props.className).toContain('overflow-hidden');
  });
});
