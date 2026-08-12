import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizedMapRow } from '@/data/maps/queries';

const mocks = vi.hoisted(() => ({
  pathname: '/atlas',
  refresh: vi.fn(),
  searchParams: new URLSearchParams('panel=signatures'),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ refresh: mocks.refresh }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'>) =>
    createElement('a', { ...props, href: String(href) }, children),
}));

vi.mock('@/components/eve-image', () => ({
  EveImage: ({
    family,
    alt,
  }: {
    family: string;
    alt: string;
  }) => createElement('span', { 'data-eve-image-family': family, 'data-alt': alt }),
}));

vi.mock('./MapCreationDialog', () => ({
  MapCreationDialog: ({
    open,
    corporations,
    openerRef,
  }: {
    open: boolean;
    corporations: readonly unknown[];
    openerRef?: React.RefObject<HTMLElement | null>;
  }) =>
    createElement('div', {
      'data-map-creation-dialog-probe': String(open),
      'data-corporation-count': String(corporations.length),
      'data-has-opener-ref': String(openerRef !== undefined),
    }),
}));

vi.mock('./MapAccessDialog', () => ({
  MapAccessDialog: () => createElement('div', { 'data-map-access-dialog-probe': '' }),
}));

vi.mock('./TrashWindow', () => ({
  TrashWindow: ({
    open,
    maps,
    finalFocus,
  }: {
    open: boolean;
    maps: readonly unknown[];
    finalFocus?: React.RefObject<HTMLElement | null>;
  }) =>
    createElement('div', {
      'data-trash-window-probe': String(open),
      'data-deleted-map-count': String(maps.length),
      'data-has-final-focus': String(finalFocus !== undefined),
    }),
}));

import {
  MapCatalogue,
  mapCatalogueSections,
} from './MapCatalogue';
import { MapCatalogueDataProvider } from './map-catalogue-data';

const MAPS: readonly AuthorizedMapRow[] = [
  {
    id: 'map-created',
    name: 'Home Chain',
    createdAt: new Date('2026-08-12T12:00:00.000Z'),
    creatorName: 'Mapper',
    role: 'admin',
    provenance: { kind: 'created' },
  },
  {
    id: 'map-corporation',
    name: 'Corp Chain',
    createdAt: new Date('2026-08-11T12:00:00.000Z'),
    creatorName: 'Director',
    role: 'editor',
    provenance: { kind: 'corporation', corporationIds: [99] },
  },
  {
    id: 'map-direct',
    name: 'Shared Chain',
    createdAt: new Date('2026-08-10T12:00:00.000Z'),
    creatorName: 'Scout',
    role: 'viewer',
    provenance: { kind: 'direct', characterIds: [42] },
  },
];

function renderCatalogue(
  maps: readonly AuthorizedMapRow[] = MAPS,
  listingAvailable = true,
): string {
  return renderToStaticMarkup(
    createElement(
      MapCatalogueDataProvider,
      {
        maps,
        deletedMaps: [
          {
            ...MAPS[0]!,
            id: 'map-deleted',
            archivedAt: new Date('2026-08-12T13:00:00.000Z'),
          },
        ],
        corporations: [{ corporationId: 99, name: 'Signal Cartel' }],
        grantsByMapId: { 'map-created': [] },
        listingAvailable,
      },
      createElement(MapCatalogue),
    ),
  );
}

beforeEach(() => {
  mocks.pathname = '/atlas';
  mocks.refresh.mockClear();
  mocks.searchParams = new URLSearchParams('panel=signatures');
});

describe('MapCatalogue', () => {
  it('partitions the exact authorized list without loss, duplication, or reordering', () => {
    const sections = mapCatalogueSections(MAPS);
    expect(sections.map((section) => section.label)).toEqual([
      'Your maps',
      'Corporation maps',
      'Shared with you',
    ]);
    expect(sections.flatMap((section) => section.maps.map((map) => map.id))).toEqual(
      MAPS.map((map) => map.id),
    );
  });

  it('renders self-hiding metadata sections, query-preserving cards, and existing doors', () => {
    const markup = renderCatalogue();

    expect(markup).toContain('Your maps');
    expect(markup).toContain('Corporation maps');
    expect(markup).toContain('Shared with you');
    expect(markup).toContain('Home Chain');
    expect(markup).toContain('Corp Chain');
    expect(markup).toContain('Shared Chain');
    expect(markup).toContain('Your access: Admin');
    expect(markup).toContain('Your access: Write');
    expect(markup).toContain('Your access: Read-only');
    expect(markup).toContain('Created 12 Aug 2026');
    expect(markup).toContain('Shared by Director');
    expect(markup).toContain('Shared by Scout');
    expect(markup).not.toContain('Shared by Mapper');
    expect(markup).toContain('data-eve-image-family="corporation-logo"');
    expect(markup).toContain('data-alt=""');
    expect(markup).toContain('href="/atlas?panel=signatures&amp;map=map-direct"');
    expect(markup).toContain('data-map-catalogue-edit="map-created"');
    expect(markup).not.toContain('data-map-catalogue-edit="map-corporation"');
    expect(markup).not.toContain('data-map-catalogue-edit="map-direct"');
    expect(markup).toContain('data-map-creation-dialog-probe="false"');
    expect(markup).toContain('data-corporation-count="1"');
    expect(markup).toContain('data-trash-window-probe="false"');
    expect(markup).toContain('data-deleted-map-count="1"');
    expect(markup).toContain('data-has-opener-ref="true"');
    expect(markup).toContain('data-has-final-focus="true"');
    expect(markup).toContain('Trash (1)');
  });

  it('keeps the create card last and owns structural scrolling inside the clipped frame', () => {
    const markup = renderCatalogue();
    expect(markup).toContain('data-map-catalogue-scroll');
    expect(markup).toContain('h-full min-h-0 overflow-y-auto overscroll-contain');
    expect(markup.lastIndexOf('data-map-catalogue-create-card')).toBeGreaterThan(
      markup.lastIndexOf('data-map-catalogue-card'),
    );
  });

  it('shows only the create card and one short hint when no maps are authorized', () => {
    const markup = renderCatalogue([]);
    expect(markup).toContain('data-map-catalogue-create-card');
    expect(markup).toContain('Create new map');
    expect(markup).toContain('data-map-catalogue-empty-hint');
    expect(markup).toContain('Create a map to begin charting a chain.');
    expect(markup).not.toContain('data-map-catalogue-card=');
    expect(markup).not.toContain('Your maps');
    expect(markup).not.toContain('Corporation maps');
    expect(markup).not.toContain('Shared with you');
  });

  it('distinguishes listing failure from a true zero-map account', () => {
    const markup = renderCatalogue([], false);
    expect(markup).toContain('data-map-catalogue-unavailable');
    expect(markup).toContain('Map catalogue unavailable');
    expect(markup).toContain('Try again');
    expect(markup).not.toContain('data-map-catalogue-empty-hint');
    expect(markup).not.toContain('data-map-catalogue-create-card');
    expect(markup).not.toContain('data-map-catalogue-trash');
  });
});
