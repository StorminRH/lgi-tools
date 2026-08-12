import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MapCatalogueDataProvider } from '@/features/maps/map-catalogue-data';
import { listRegisteredSources } from '@/platform/search';
import { MapChrome } from './MapChrome';

vi.mock('@/components/composition/account/AccountMenu', () => ({
  AccountMenu: ({ contextualSection }: { contextualSection?: React.ReactNode }) =>
    createElement('div', { 'data-account-menu': '' }, contextualSection),
}));

vi.mock('@/components/composition/FeedbackButton', () => ({
  FeedbackButton: ({ compact, embedded }: { compact?: boolean; embedded?: boolean }) =>
    createElement('div', {
      'data-feedback-compact': String(compact),
      'data-feedback-embedded': String(embedded),
    }),
}));

vi.mock('./MapMenu', () => ({
  MapMenu: ({
    corporations,
    deletedMaps,
    mapActionsAvailable,
  }: {
    corporations?: readonly unknown[];
    deletedMaps?: readonly unknown[];
    mapActionsAvailable?: boolean;
  }) =>
    createElement('div', {
      'data-map-menu': '',
      'data-map-corporation-count': String(corporations?.length ?? 0),
      'data-deleted-map-count': String(deletedMaps?.length ?? 0),
      'data-map-actions-available': String(mapActionsAvailable),
    }),
}));

vi.mock('@/features/maps/MapSwitcher', () => ({
  MapSwitcher: ({ maps }: { maps: readonly unknown[] }) =>
    createElement('div', { 'data-map-switcher': '', 'data-map-count': maps.length }),
}));

describe('MapChrome', () => {
  function renderChrome({
    session,
    contextualSection,
    corporations = [],
    deletedMaps = [],
    maps = [],
    listingAvailable = true,
  }: {
    session: React.ComponentProps<typeof MapChrome>['session'];
    contextualSection?: React.ReactNode;
    corporations?: readonly { corporationId: number; name: string }[];
    deletedMaps?: readonly {
      id: string;
      name: string;
      createdAt: Date;
      creatorName: string;
      role: 'admin';
      archivedAt: Date;
      provenance: { kind: 'created' };
    }[];
    maps?: readonly {
      id: string;
      name: string;
      createdAt: Date;
      creatorName: string;
      role: 'admin';
      provenance: { kind: 'created' };
    }[];
    listingAvailable?: boolean;
  }): string {
    return renderToStaticMarkup(
      createElement(
        MapCatalogueDataProvider,
        {
          corporations,
          deletedMaps,
          maps,
          grantsByMapId: {},
          listingAvailable,
        },
        createElement(MapChrome, { session, contextualSection }),
      ),
    );
  }

  it('registers the systems search source so atlas pickers can suggest', () => {
    // MapChrome's side-effect import is the atlas boot path for register-all;
    // without it, scoped `searchAll(..., ['systems'])` returns no sections.
    expect(listRegisteredSources().some((source) => source.id === 'systems')).toBe(
      true,
    );
  });

  it('composes three floating positions while leaving the search slot empty', () => {
    const markup = renderChrome({
      session: {
        characterId: 1,
        name: 'Mapper',
        portraitUrl: '/portrait.png',
        role: 'ADMIN',
      },
      corporations: [{ corporationId: 99, name: 'Signal Cartel' }],
      deletedMaps: [
        {
          id: 'map-deleted',
          name: 'Deleted',
          createdAt: new Date(),
          creatorName: 'Mapper',
          role: 'admin',
          archivedAt: new Date(),
          provenance: { kind: 'created' },
        },
      ],
      maps: [
        {
          id: 'map-a',
          name: 'Alpha',
          createdAt: new Date(),
          creatorName: 'Mapper',
          role: 'admin',
          provenance: { kind: 'created' },
        },
      ],
    });

    expect(markup).toContain('data-map-menu');
    expect(markup).toContain('data-map-corporation-count="1"');
    expect(markup).toContain('data-deleted-map-count="1"');
    expect(markup).toContain('data-map-actions-available="true"');
    expect(markup).toContain('data-account-menu');
    expect(markup).toContain('right-4 top-4');
    expect(markup).toContain('data-feedback-compact="true"');
    expect(markup).toContain('data-feedback-embedded="true"');
    expect(markup).toContain('data-map-chrome-chips');
    expect(markup).toContain('bottom-4 right-4');
    expect(markup).toContain('data-map-search-slot');
    expect(markup).toContain('data-map-switcher');
    expect(markup).toContain('data-map-count="1"');
  });

  it('forwards the map-owned contextual settings into the account menu', () => {
    const markup = renderChrome({
      session: {
        characterId: 1,
        name: 'Mapper',
        portraitUrl: '/portrait.png',
        role: 'ADMIN',
      },
      contextualSection: createElement('div', { 'data-map-settings': '' }),
    });

    expect(markup).toContain('data-account-menu');
    expect(markup).toContain('data-map-settings');
  });

  it('omits only the account control when an authorized user has no active character', () => {
    const markup = renderChrome({ session: null });

    expect(markup).toContain('data-map-menu');
    expect(markup).toContain('data-map-search-slot');
    expect(markup).toContain('data-map-switcher');
    expect(markup).toContain('data-feedback-compact="true"');
    expect(markup).not.toContain('data-account-menu');
  });

  it('disables map actions when the shared listing snapshot is unavailable', () => {
    const markup = renderChrome({ session: null, listingAvailable: false });
    expect(markup).toContain('data-map-actions-available="false"');
  });
});
