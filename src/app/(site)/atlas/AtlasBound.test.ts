import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasBound } from './AtlasBound';

const mocks = vi.hoisted(() => ({
  checkSession: vi.fn(),
  connection: vi.fn(),
  rethrow: vi.fn(),
  getScannerSiteIndex: vi.fn(),
  getSiteSearchIndex: vi.fn(),
  listMapChromeData: vi.fn(),
}));

vi.mock('@/platform/auth/route-guards', () => ({
  checkSession: mocks.checkSession,
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

vi.mock('./AtlasGuestLanding', () => ({
  AtlasGuestLanding: () => createElement('div', { 'data-atlas-guest-landing': '' }),
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
  role: 'USER',
};

describe('AtlasBound', () => {
  beforeEach(() => {
    mocks.checkSession.mockReset();
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

  it('lands guests on the sign-in page, admits signed-in members, fails closed on auth errors, and rethrows framework signals', async () => {
    mocks.checkSession.mockResolvedValue({ ok: false, failure: { code: 'unauthenticated' } });
    const signedOut = renderToStaticMarkup(await AtlasBound({ mapSelected: false }));
    expect(signedOut).toContain('data-atlas-guest-landing');
    expect(signedOut).not.toContain('data-map-catalogue');
    expect(signedOut).not.toContain('data-map-canvas-frame');
    expect(signedOut).not.toContain('data-map-development-wall');
    const signedOutMap = renderToStaticMarkup(await AtlasBound({ mapSelected: true }));
    expect(signedOutMap).toContain('data-atlas-guest-landing');
    expect(signedOutMap).not.toContain('data-map-catalogue');
    expect(signedOutMap).not.toContain('data-map-canvas-frame');
    expect(mocks.listMapChromeData).not.toHaveBeenCalled();
    expect(mocks.getScannerSiteIndex).not.toHaveBeenCalled();
    expect(mocks.connection).toHaveBeenCalledTimes(2);
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkSession.mock.invocationCallOrder[0]!,
    );

    mocks.checkSession.mockResolvedValue({ ok: true, session });
    const landing = renderToStaticMarkup(await AtlasBound({ mapSelected: false }));
    expect(landing).toContain('data-map-catalogue');
    expect(landing).toContain('data-site-catalogue');
    expect(landing).toContain('data-map-site-index="1"');
    expect(landing).toContain('data-map-catalogue-provider');
    expect(landing).toContain('data-provider-map-count="1"');
    expect(landing).toContain('data-provider-listing-available="true"');
    expect(landing).not.toContain('data-map-canvas-frame');
    expect(mocks.getScannerSiteIndex).toHaveBeenCalled();
    expect(mocks.listMapChromeData).toHaveBeenCalledOnce();

    const canvas = renderToStaticMarkup(await AtlasBound({ mapSelected: true }));
    expect(canvas).toContain('data-map-canvas-frame');
    expect(canvas).toContain('data-map-account-session="true"');
    expect(canvas).not.toContain('data-map-catalogue=""');

    mocks.checkSession.mockResolvedValue({
      ok: true,
      session: { ...session, characterId: null },
    });
    const noCharacter = renderToStaticMarkup(await AtlasBound({ mapSelected: true }));
    expect(noCharacter).toContain('data-map-canvas-frame');
    expect(noCharacter).toContain('data-map-account-session="false"');

    const err = new Error('session store unavailable');
    mocks.checkSession.mockRejectedValue(err);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = renderToStaticMarkup(await AtlasBound({ mapSelected: false }));
    expect(failed).toContain('data-map-catalogue');
    expect(failed).toContain('data-provider-listing-available="false"');
    expect(failed).not.toContain('data-atlas-guest-landing');
    expect(failed).not.toContain('data-map-development-wall');
    const failedMap = renderToStaticMarkup(await AtlasBound({ mapSelected: true }));
    expect(failedMap).toContain('data-map-catalogue');
    expect(failedMap).not.toContain('data-map-canvas-frame');
    expect(mocks.rethrow).toHaveBeenCalledWith(err);
    expect(consoleError).toHaveBeenCalledWith(
      '[map] authorization check unavailable',
      err,
    );

    const signal = new Error('NEXT_REDIRECT');
    mocks.checkSession.mockRejectedValue(signal);
    mocks.rethrow.mockImplementation((rethrowErr: unknown) => {
      throw rethrowErr;
    });
    consoleError.mockClear();
    await expect(AtlasBound({ mapSelected: false })).rejects.toBe(signal);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps an authorized map up when the priced scanner catalogue fails', async () => {
    mocks.checkSession.mockResolvedValue({ ok: true, session });
    const pricedErr = new Error('prices unavailable');
    mocks.getScannerSiteIndex.mockRejectedValue(pricedErr);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const degraded = renderToStaticMarkup(await AtlasBound({ mapSelected: true }));

    expect(degraded).toContain('data-map-canvas-frame');
    expect(degraded).toContain('data-map-site-index="1"');
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
  });

  it('marks a failed map listing as unavailable instead of a true empty catalogue', async () => {
    mocks.checkSession.mockResolvedValue({ ok: true, session });
    const listingError = new Error('map listing unavailable');
    mocks.listMapChromeData.mockRejectedValue(listingError);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const degraded = renderToStaticMarkup(await AtlasBound({ mapSelected: false }));

    expect(degraded).toContain('data-map-catalogue');
    expect(degraded).toContain('data-provider-map-count="0"');
    expect(degraded).toContain('data-provider-listing-available="false"');
    expect(mocks.rethrow).toHaveBeenCalledWith(listingError);
    expect(consoleError).toHaveBeenCalledWith(
      '[map] map listing unavailable; retry required',
      listingError,
    );
  });
});
