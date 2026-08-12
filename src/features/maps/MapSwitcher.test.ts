import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/atlas',
  push: vi.fn(),
  refresh: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/components/ui/menu', () => ({
  Menu: ({
    trigger,
    triggerProps,
    children,
  }: {
    trigger: React.ReactNode;
    triggerProps?: Record<string, unknown> & { ref?: React.Ref<HTMLButtonElement> };
    children: React.ReactNode;
  }) => {
    const { ref: _ref, ...buttonProps } = triggerProps ?? {};
    return createElement(
      'div',
      { 'data-menu': '' },
      createElement('button', buttonProps, trigger),
      children,
    );
  },
  MenuItem: ({
    children,
    closeOnClick: _closeOnClick,
    ...props
  }: {
    children: React.ReactNode;
    closeOnClick?: boolean;
  }) => createElement('button', props, children),
  menuRow: 'menu-row',
}));

vi.mock('./MapAccessDialog', () => ({
  MapAccessDialog: ({
    finalFocus,
  }: {
    finalFocus: React.RefObject<HTMLElement | null>;
  }) =>
    createElement('div', {
      'data-map-access-dialog': '',
      'data-has-final-focus': String(finalFocus !== undefined),
    }),
}));

import { MapSwitcher, mapSwitcherHref } from './MapSwitcher';

const MAPS = [
  {
    id: 'map-a',
    name: 'Alpha',
    createdAt: new Date('2026-08-12T12:00:00.000Z'),
    creatorName: 'Mapper',
    role: 'admin' as const,
    provenance: { kind: 'created' as const },
  },
  {
    id: 'map-b',
    name: 'Bravo',
    createdAt: new Date('2026-08-12T11:00:00.000Z'),
    creatorName: 'Other',
    role: 'viewer' as const,
    provenance: { kind: 'direct' as const, characterIds: [42] },
  },
];

beforeEach(() => {
  mocks.push.mockClear();
  mocks.refresh.mockClear();
  mocks.searchParams = new URLSearchParams();
});

describe('MapSwitcher', () => {
  it('renders only for an authorized selected map and consumes the exact supplied list', () => {
    const absent = renderToStaticMarkup(
      createElement(MapSwitcher, {
        maps: MAPS,
        corporations: [],
        grantsByMapId: {},
      }),
    );
    expect(absent).toBe('');

    mocks.searchParams = new URLSearchParams('map=map-a');
    const selected = renderToStaticMarkup(
      createElement(MapSwitcher, {
        maps: MAPS,
        corporations: [],
        grantsByMapId: { 'map-a': [] },
      }),
    );

    expect(selected).toContain('data-map-switcher-trigger');
    expect(selected).toContain('data-map-id="map-a"');
    expect(selected).toContain('Alpha');
    expect(selected).toContain('Bravo');
    expect(selected).toContain('data-map-switcher-map="map-a"');
    expect(selected).toContain('data-map-switcher-map="map-b"');
    expect(selected).toContain('aria-current="page"');
    expect(selected).toContain('data-map-switcher-manage="map-a"');
    expect(selected).not.toContain('data-map-switcher-manage="map-b"');
  });

  it('preserves unrelated query values and produces a push-safe encoded map target', () => {
    expect(
      mapSwitcherHref(
        '/atlas',
        new URLSearchParams('map=old&panel=signatures'),
        'map/one',
      ),
    ).toBe('/atlas?map=map%2Fone&panel=signatures');
  });
});
