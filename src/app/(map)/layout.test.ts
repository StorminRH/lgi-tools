import { createElement, Suspense } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapLayout, { MapAccessGate } from './layout';

const mocks = vi.hoisted(() => ({
  checkAdmin: vi.fn(),
  connection: vi.fn(),
  rethrow: vi.fn(),
  getScannerSiteIndex: vi.fn(),
  getSiteSearchIndex: vi.fn(),
}));

vi.mock('@/platform/auth/route-guards', () => ({
  checkAdmin: mocks.checkAdmin,
}));

// The gate delegates framework-signal handling to next/navigation's
// unstable_rethrow: a no-op stub leaves a genuine failure to fail closed to the
// wall, a throwing stub stands in for a real PPR/redirect signal.
vi.mock('next/navigation', () => ({
  unstable_rethrow: (err: unknown) => mocks.rethrow(err),
}));

vi.mock('next/server', () => ({
  connection: () => mocks.connection(),
}));

vi.mock('@/features/wormhole-sites/queries', () => ({
  getScannerSiteIndex: () => mocks.getScannerSiteIndex(),
  getSiteSearchIndex: () => mocks.getSiteSearchIndex(),
}));

vi.mock('@/features/wormhole-sites/site-catalogue', () => ({
  SiteCatalogueProvider: ({
    siteIndex,
    children,
  }: {
    siteIndex: readonly { id: number; name: string }[];
    children: React.ReactNode;
  }) =>
    createElement(
      'div',
      { 'data-site-catalogue': '', 'data-map-site-index': String(siteIndex.length) },
      children,
    ),
}));

vi.mock('@/components/composition/map/MapChrome', () => ({
  MapChrome: ({
    session: value,
    contextualSection,
  }: {
    session: unknown;
    contextualSection?: React.ReactNode;
  }) =>
    createElement('div', {
      'data-map-chrome': '',
      'data-map-account-session': String(value != null),
      'data-map-contextual-section': String(contextualSection != null),
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
    mocks.connection.mockReset();
    mocks.connection.mockResolvedValue(undefined);
    mocks.rethrow.mockReset();
    mocks.getScannerSiteIndex.mockReset();
    mocks.getScannerSiteIndex.mockResolvedValue([
      { id: 49, name: 'Barren Perimeter Reservoir' },
    ]);
    mocks.getSiteSearchIndex.mockReset();
    mocks.getSiteSearchIndex.mockResolvedValue([
      { id: 1, name: 'Forgotten Perimeter Coronation Platform' },
    ]);
  });

  // Restores the console spies unconditionally: a manual restore at the end of a
  // test body is skipped when an assertion above it throws, leaving the stub
  // active and hiding later diagnostics.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('walls non-admins, admits admins (with or without a character), fails closed on auth errors, and rethrows framework signals', async () => {
    mocks.checkAdmin.mockResolvedValue({ ok: false, failure: { code: 'forbidden' } });
    const wall = renderToStaticMarkup(
      await MapAccessGate({
        children: createElement('div', { 'data-map-canvas': '' }),
      }),
    );
    expect(wall).toContain('data-map-development-wall');
    expect(wall).toContain('under development');
    expect(wall).not.toContain('data-map-canvas');
    expect(wall).not.toContain('data-map-chrome');
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkAdmin.mock.invocationCallOrder[0]!,
    );

    mocks.checkAdmin.mockResolvedValue({ ok: true, session });
    const admin = renderToStaticMarkup(
      await MapAccessGate({
        children: createElement('div', { 'data-map-canvas': '' }),
      }),
    );
    expect(admin).toContain('data-map-chrome');
    expect(admin).toContain('data-site-catalogue');
    expect(admin).toContain('data-map-site-index="1"');
    expect(admin).toContain('data-map-contextual-section="true"');
    expect(admin).toContain('data-map-canvas');
    expect(admin).not.toContain('data-map-development-wall');
    expect(mocks.getScannerSiteIndex).toHaveBeenCalled();

    mocks.checkAdmin.mockResolvedValue({
      ok: true,
      session: { ...session, characterId: null },
    });
    const noCharacter = renderToStaticMarkup(
      await MapAccessGate({
        children: createElement('div', { 'data-map-canvas': '' }),
      }),
    );
    expect(noCharacter).toContain('data-map-chrome');
    expect(noCharacter).toContain('data-map-account-session="false"');
    expect(noCharacter).toContain('data-map-canvas');
    expect(noCharacter).not.toContain('data-map-development-wall');

    const err = new Error('session store unavailable');
    mocks.checkAdmin.mockRejectedValue(err);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = renderToStaticMarkup(
      await MapAccessGate({
        children: createElement('div', { 'data-map-canvas': '' }),
      }),
    );
    // error.tsx covers a segment's children, not its own layout, so an escaping
    // throw here would leave the map without its recovery surface.
    expect(failed).toContain('data-map-development-wall');
    expect(failed).not.toContain('data-map-canvas');
    expect(failed).not.toContain('data-map-chrome');
    expect(mocks.rethrow).toHaveBeenCalledWith(err);
    expect(consoleError).toHaveBeenCalledWith(
      '[map] authorization check unavailable',
      err,
    );

    const signal = new Error('NEXT_REDIRECT');
    mocks.checkAdmin.mockRejectedValue(signal);
    mocks.rethrow.mockImplementation((rethrowErr: unknown) => {
      throw rethrowErr;
    });
    consoleError.mockClear();
    await expect(
      MapAccessGate({ children: createElement('div', { 'data-map-canvas': '' }) }),
    ).rejects.toBe(signal);
    expect(consoleError).not.toHaveBeenCalled();

    // Priced scanner catalogue failure must not wall an authorized map.
    mocks.checkAdmin.mockResolvedValue({ ok: true, session });
    mocks.rethrow.mockReset();
    const pricedErr = new Error('prices unavailable');
    mocks.getScannerSiteIndex.mockRejectedValue(pricedErr);
    consoleError.mockClear();
    const degraded = renderToStaticMarkup(
      await MapAccessGate({
        children: createElement('div', { 'data-map-canvas': '' }),
      }),
    );
    expect(degraded).toContain('data-map-chrome');
    expect(degraded).toContain('data-map-canvas');
    expect(degraded).toContain('data-map-site-index="1"');
    expect(degraded).not.toContain('data-map-development-wall');
    expect(mocks.getSiteSearchIndex).toHaveBeenCalled();
    expect(mocks.rethrow).toHaveBeenCalledWith(pricedErr);
    expect(consoleError).toHaveBeenCalledWith(
      '[map] scanner site catalogue unavailable; degrading',
      pricedErr,
    );

    mocks.getSiteSearchIndex.mockRejectedValue(new Error('catalogue down'));
    consoleError.mockClear();
    mocks.rethrow.mockClear();
    const empty = renderToStaticMarkup(
      await MapAccessGate({
        children: createElement('div', { 'data-map-canvas': '' }),
      }),
    );
    expect(empty).toContain('data-map-chrome');
    expect(empty).toContain('data-map-canvas');
    expect(empty).toContain('data-map-site-index="0"');
    expect(empty).not.toContain('data-map-development-wall');
  });
});

describe('MapLayout', () => {
  it('owns the full viewport frame and uses the development wall as Suspense fallback', () => {
    const frame = MapLayout({
      children: createElement('div', { 'data-map-canvas': '' }),
    });

    expect(frame.props.className).toContain('relative');
    expect(frame.props.className).toContain('h-[100dvh]');
    expect(frame.props.className).toContain('w-full');
    expect(frame.props.className).toContain('overflow-hidden');

    const suspense = frame.props.children;
    expect(suspense.type).toBe(Suspense);
    const fallbackMarkup = renderToStaticMarkup(suspense.props.fallback);
    expect(fallbackMarkup).toContain('data-map-development-wall');
    expect(fallbackMarkup).toContain('Mapping the unknown');
  });
});
