import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasBound } from './AtlasBound';

const mocks = vi.hoisted(() => ({
  checkAdmin: vi.fn(),
  connection: vi.fn(),
  rethrow: vi.fn(),
  getScannerSiteIndex: vi.fn(),
  getSiteSearchIndex: vi.fn(),
  listMapChromeData: vi.fn(),
}));

vi.mock('@/platform/auth/route-guards', () => ({
  checkAdmin: mocks.checkAdmin,
}));

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

vi.mock('@/features/maps/map-catalogue-data', () => ({
  MapCatalogueDataProvider: ({
    maps,
    deletedMaps,
    corporations,
    grantsByMapId,
    listingAvailable,
    children,
  }: {
    maps: readonly unknown[];
    deletedMaps: readonly unknown[];
    corporations: readonly unknown[];
    grantsByMapId: Readonly<Record<string, readonly unknown[]>>;
    listingAvailable: boolean;
    children: React.ReactNode;
  }) =>
    createElement(
      'div',
      {
        'data-map-catalogue-provider': '',
        'data-provider-map-count': String(maps.length),
        'data-provider-deleted-count': String(deletedMaps.length),
        'data-provider-corporation-count': String(corporations.length),
        'data-provider-grant-count': String(grantsByMapId['map-a']?.length ?? 0),
        'data-provider-listing-available': String(listingAvailable),
      },
      children,
    ),
}));

vi.mock('@/composition/map-access', () => ({
  listMapChromeData: mocks.listMapChromeData,
}));

vi.mock('@/features/maps/MapCatalogue', () => ({
  MapCatalogue: () => createElement('div', { 'data-map-catalogue': '' }),
}));

vi.mock('./AtlasCanvasFrame', () => ({
  AtlasCanvasFrame: ({ session }: { session: unknown }) =>
    createElement('div', {
      'data-map-canvas-frame': '',
      'data-map-account-session': String(session != null),
    }),
}));

const session = {
  user: { id: 'user-1' },
  characterId: 1,
  name: 'Mapper',
  portraitUrl: '/portrait.png',
  role: 'ADMIN',
};

describe('AtlasBound', () => {
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
    mocks.listMapChromeData.mockReset();
    mocks.listMapChromeData.mockResolvedValue({
      corporations: [{ corporationId: 99, name: 'Signal Cartel' }],
      maps: [{ id: 'map-a', name: 'Alpha' }],
      deletedMaps: [{ id: 'map-deleted', name: 'Deleted' }],
      grantsByMapId: { 'map-a': [{ ownerId: 42 }] },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('walls non-admins, admits the catalogue or canvas, fails closed on auth errors, and rethrows framework signals', async () => {
    mocks.checkAdmin.mockResolvedValue({ ok: false, failure: { code: 'forbidden' } });
    const wall = renderToStaticMarkup(await AtlasBound({ mapSelected: false }));
    expect(wall).toContain('data-map-development-wall');
    expect(wall).toContain('under development');
    expect(wall).not.toContain('data-map-catalogue');
    expect(wall).not.toContain('data-map-canvas-frame');
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkAdmin.mock.invocationCallOrder[0]!,
    );

    mocks.checkAdmin.mockResolvedValue({ ok: true, session });
    const landing = renderToStaticMarkup(await AtlasBound({ mapSelected: false }));
    expect(landing).toContain('data-map-catalogue');
    expect(landing).toContain('data-site-catalogue');
    expect(landing).toContain('data-map-site-index="1"');
    expect(landing).toContain('data-map-catalogue-provider');
    expect(landing).toContain('data-provider-map-count="1"');
    expect(landing).toContain('data-provider-listing-available="true"');
    expect(landing).not.toContain('data-map-canvas-frame');
    expect(landing).not.toContain('data-map-development-wall');
    expect(mocks.getScannerSiteIndex).toHaveBeenCalled();
    expect(mocks.listMapChromeData).toHaveBeenCalledOnce();

    const canvas = renderToStaticMarkup(await AtlasBound({ mapSelected: true }));
    expect(canvas).toContain('data-map-canvas-frame');
    expect(canvas).toContain('data-map-account-session="true"');
    expect(canvas).not.toContain('data-map-catalogue=""');
    expect(canvas).not.toContain('data-map-development-wall');

    mocks.checkAdmin.mockResolvedValue({
      ok: true,
      session: { ...session, characterId: null },
    });
    const noCharacter = renderToStaticMarkup(await AtlasBound({ mapSelected: true }));
    expect(noCharacter).toContain('data-map-canvas-frame');
    expect(noCharacter).toContain('data-map-account-session="false"');

    const err = new Error('session store unavailable');
    mocks.checkAdmin.mockRejectedValue(err);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = renderToStaticMarkup(await AtlasBound({ mapSelected: false }));
    expect(failed).toContain('data-map-development-wall');
    expect(failed).not.toContain('data-map-catalogue');
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
    await expect(AtlasBound({ mapSelected: false })).rejects.toBe(signal);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps an authorized map up when the priced scanner catalogue fails', async () => {
    mocks.checkAdmin.mockResolvedValue({ ok: true, session });
    const pricedErr = new Error('prices unavailable');
    mocks.getScannerSiteIndex.mockRejectedValue(pricedErr);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const degraded = renderToStaticMarkup(await AtlasBound({ mapSelected: true }));

    expect(degraded).toContain('data-map-canvas-frame');
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
    const empty = renderToStaticMarkup(await AtlasBound({ mapSelected: true }));
    expect(empty).toContain('data-map-canvas-frame');
    expect(empty).toContain('data-map-site-index="0"');
    expect(empty).not.toContain('data-map-development-wall');
  });

  it('marks a failed map listing as unavailable instead of a true empty catalogue', async () => {
    mocks.checkAdmin.mockResolvedValue({ ok: true, session });
    const listingError = new Error('map listing unavailable');
    mocks.listMapChromeData.mockRejectedValue(listingError);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const degraded = renderToStaticMarkup(await AtlasBound({ mapSelected: false }));

    expect(degraded).toContain('data-map-catalogue');
    expect(degraded).toContain('data-provider-map-count="0"');
    expect(degraded).toContain('data-provider-listing-available="false"');
    expect(degraded).not.toContain('data-map-development-wall');
    expect(mocks.rethrow).toHaveBeenCalledWith(listingError);
    expect(consoleError).toHaveBeenCalledWith(
      '[map] map listing unavailable; retry required',
      listingError,
    );
  });
});
