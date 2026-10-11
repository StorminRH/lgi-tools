import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizedMapRow } from '@/data/maps/queries';
import type { EditingMapAccessDialog } from './MapAccessDialog';

type EditorProps = Parameters<typeof EditingMapAccessDialog>[0];

const mocks = vi.hoisted(() => ({
  pathname: '/atlas',
  push: vi.fn(),
  refresh: vi.fn(),
  searchParams: new URLSearchParams(),
  manage: new Map<string, () => void>(),
  editor: null as EditorProps | null,
}));
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

// Keep the switcher's dialog state between static renders so a cog press drives the next one.
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: rt.react.useState,
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
    triggerClassName,
    children,
    className,
  }: {
    trigger: React.ReactNode;
    triggerProps?: Record<string, unknown> & { ref?: React.Ref<HTMLButtonElement> };
    triggerClassName?: string;
    children: React.ReactNode;
    className?: string;
  }) => {
    const { ref: _ref, ...buttonProps } = triggerProps ?? {};
    return createElement(
      'div',
      { 'data-menu': '', className },
      createElement('button', { ...buttonProps, className: triggerClassName }, trigger),
      children,
    );
  },
  MenuItem: ({
    children,
    closeOnClick: _closeOnClick,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    closeOnClick?: boolean;
    onClick?: () => void;
    'data-map-switcher-manage'?: string;
  }) => {
    const manages = props['data-map-switcher-manage'];
    if (manages !== undefined && onClick) mocks.manage.set(manages, onClick);
    return createElement('button', props, children);
  },
  menuRow: 'menu-row',
}));

vi.mock('./MapAccessDialog', () => ({
  EditingMapAccessDialog: (props: EditorProps) => {
    mocks.editor = props;
    return null;
  },
}));

import { MapSwitcher } from './MapSwitcher';

const ALPHA: AuthorizedMapRow = {
  id: 'map-a',
  name: 'Alpha',
  createdAt: new Date('2026-08-12T12:00:00.000Z'),
  creatorName: 'Mapper',
  role: 'admin',
  provenance: { kind: 'created' },
};
const BRAVO: AuthorizedMapRow = {
  id: 'map-b',
  name: 'Bravo',
  createdAt: new Date('2026-08-12T11:00:00.000Z'),
  creatorName: 'Other',
  role: 'viewer',
  provenance: { kind: 'direct', characterIds: [42] },
};
const MAPS = [ALPHA, BRAVO];

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
        blocksByMapId: {},
        listingAvailable: true,
      }),
    );
    expect(absent).toBe('');
    expect(absent).not.toContain('data-map-switcher-trigger');

    mocks.searchParams = new URLSearchParams('map=map-a');
    const selected = renderToStaticMarkup(
      createElement(MapSwitcher, {
        maps: MAPS,
        corporations: [],
        grantsByMapId: { 'map-a': [] },
        blocksByMapId: { 'map-a': [] },
        listingAvailable: true,
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
    expect(selected).toContain('max-w-full');
    expect(selected).toContain('min-w-0');
    expect(selected).toContain('truncate');
    expect(selected).toContain('scroll-area');
    expect(selected).toContain('max-h-[min(24rem,var(--available-height))]');
    expect(selected).toContain('overflow-y-auto');
  });

  it('keeps an open access editor through another map\'s role change and closes it when its own map loses admin', () => {
    rt.unmount();
    mocks.manage.clear();
    mocks.searchParams = new URLSearchParams('map=map-a');
    const fallback = { isConnected: true } as HTMLElement;
    const render = (maps: readonly AuthorizedMapRow[]) =>
      rt.render(
        renderToStaticMarkup,
        createElement(MapSwitcher, {
          maps,
          corporations: [],
          grantsByMapId: {},
          blocksByMapId: {},
          listingAvailable: true,
          focusFallback: { current: fallback },
        }),
      );
    const bothAdmin = [ALPHA, { ...BRAVO, role: 'admin' as const }];

    render(bothAdmin);
    expect(mocks.editor?.editingMap).toBeNull();
    mocks.manage.get('map-a')?.();
    render(bothAdmin);
    expect(mocks.editor?.editingMap).toBe(ALPHA);
    // Static markup never mounts the trigger, so closing returns focus to the fallback.
    expect(mocks.editor?.finalFocus()).toBe(fallback);

    // Bravo losing admin used to change the switcher's key and close Alpha's editor.
    render(MAPS);
    expect(mocks.editor?.editingMap).toBe(ALPHA);

    render([{ ...ALPHA, role: 'editor' }, BRAVO]);
    expect(mocks.editor?.editingMap).toBeNull();
    render(MAPS);
    expect(mocks.editor?.editingMap).toBeNull();

    mocks.manage.get('map-a')?.();
    render(MAPS);
    expect(mocks.editor?.editingMap).toBe(ALPHA);
    mocks.editor?.onClose();
    render(MAPS);
    expect(mocks.editor?.editingMap).toBeNull();
  });
});
