import { createElement, createRef, type ReactNode, type Ref } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

type MenuStubProps = {
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  triggerProps?: Record<string, unknown> & { ref?: Ref<HTMLButtonElement> };
  popupProps?: Record<string, unknown>;
  className?: string;
  surface?: string;
  side?: string;
  align?: string;
  sideOffset?: number;
  children: ReactNode;
};

const seen = vi.hoisted(() => ({ menu: null as MenuStubProps | null }));

// The real popup portals and never reaches static markup, so the stub lays the
// trigger and panel out inline with the classes and attributes Menu receives.
vi.mock('./menu', () => ({
  Menu: (props: MenuStubProps) => {
    seen.menu = props;
    const { ref: _ref, ...trigger } = props.triggerProps ?? {};
    return createElement(
      'div',
      null,
      createElement(
        'button',
        { ...trigger, 'aria-label': props.label, className: props.triggerClassName },
        props.trigger,
      ),
      createElement('div', { ...props.popupProps, role: 'menu', className: props.className }, props.children),
    );
  },
}));

import { SwitcherMenu } from './switcher-menu';

/** The classes on the first `<tag … marker …>` element in the markup. */
function classesOf(html: string, tag: 'button' | 'div', marker = ''): string[] {
  const match = new RegExp(`<${tag}[^>]*${marker}[^>]*class="([^"]*)"`).exec(html);
  expect(match, html).not.toBeNull();
  return match![1]!.split(' ');
}

test('SwitcherMenu names the open record in a glass pill over a capped, scrolling panel', () => {
  const html = renderToStaticMarkup(
    SwitcherMenu({
      label: 'Switch profile from Main',
      current: 'Main',
      className: 'flex min-w-64 flex-col',
      children: createElement('button', { 'aria-current': 'true' }, 'Main'),
    }),
  );

  expect(html).toContain('aria-label="Switch profile from Main"');
  expect(html).toMatch(/<span class="truncate">Main<\/span><span aria-hidden="true"[^>]*>⌄<\/span>/);
  expect(classesOf(html, 'button')).toEqual(
    expect.arrayContaining(['glass-surface', 'rounded-full', 'h-10', 'w-max', 'max-w-full', 'min-w-0', 'focus-visible:border-border-active']),
  );
  expect(classesOf(html, 'div', 'role="menu"')).toEqual(
    expect.arrayContaining([
      'scroll-area',
      'max-h-[min(24rem,var(--available-height))]',
      'overflow-y-auto',
      'overscroll-contain',
      'flex',
      'min-w-64',
      'flex-col',
    ]),
  );
  expect(html).toContain('<button aria-current="true">Main</button>');
  expect(seen.menu).toMatchObject({ surface: 'frosted', side: 'bottom', align: 'start', sideOffset: 8 });
});

test('SwitcherMenu forwards trigger and panel attributes, the trigger ref and the alignment', () => {
  const ref = createRef<HTMLButtonElement>();
  const html = renderToStaticMarkup(
    SwitcherMenu({
      label: 'Switch map from Alpha',
      current: 'Alpha',
      align: 'center',
      triggerProps: { ref, 'data-map-switcher-trigger': '', 'data-map-id': 'map-a' },
      popupProps: { 'data-map-switcher-panel': '' },
      className: 'grid min-w-72 grid-cols-[minmax(0,1fr)_auto]',
      children: createElement('button', { 'aria-current': 'page' }, 'Alpha'),
    }),
  );

  expect(html).toMatch(/<button data-map-switcher-trigger="" data-map-id="map-a" aria-label="Switch map from Alpha"/);
  expect(html).toMatch(/<div data-map-switcher-panel="" role="menu"/);
  expect(classesOf(html, 'div', 'role="menu"').slice(-3)).toEqual([
    'grid',
    'min-w-72',
    'grid-cols-[minmax(0,1fr)_auto]',
  ]);
  expect(seen.menu?.triggerProps?.ref).toBe(ref);
  expect(seen.menu?.align).toBe('center');
});
