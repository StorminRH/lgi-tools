import { createElement, type ComponentProps, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const portal = vi.hoisted(() => {
  const containers: unknown[] = [];
  return {
    containers,
    Portal: (props: { container?: unknown }) => {
      containers.push(props.container);
      return null;
    },
  };
});

vi.mock('@base-ui/react/tooltip', async (importOriginal) => {
  const { Tooltip } = await importOriginal<typeof import('@base-ui/react/tooltip')>();
  return { Tooltip: { ...Tooltip, Portal: portal.Portal } };
});
vi.mock('@base-ui/react/popover', async (importOriginal) => {
  const { Popover } = await importOriginal<typeof import('@base-ui/react/popover')>();
  return { Popover: { ...Popover, Portal: portal.Portal } };
});
vi.mock('@base-ui/react/menu', async (importOriginal) => {
  const { Menu } = await importOriginal<typeof import('@base-ui/react/menu')>();
  return { Menu: { ...Menu, Portal: portal.Portal } };
});
vi.mock('@base-ui/react/select', async (importOriginal) => {
  const { Select } = await importOriginal<typeof import('@base-ui/react/select')>();
  return { Select: { ...Select, Portal: portal.Portal } };
});
vi.mock('@base-ui/react/autocomplete', async (importOriginal) => {
  const { Autocomplete } = await importOriginal<typeof import('@base-ui/react/autocomplete')>();
  return { Autocomplete: { ...Autocomplete, Portal: portal.Portal } };
});

import * as Combobox from './combobox';
import { Menu } from './menu';
import { OverlayPortalContainerProvider } from './overlay-portal-container';
import { PointerMenu } from './pointer-menu';
import { Popover } from './popover';
import { Select } from './select';
import { Tooltip } from './tooltip';

const tooltip: ComponentProps<typeof Tooltip> = {
  content: 'Bonus',
  children: createElement('button', { type: 'button' }, 'ME'),
};
const popover: ComponentProps<typeof Popover> = { trigger: '?', label: 'Help', children: 'Body' };
const menu: ComponentProps<typeof Menu> = { trigger: 'Open', label: 'Actions', children: null };
const pointerMenu: ComponentProps<typeof PointerMenu> = {
  open: false,
  onOpenChange: () => {},
  anchor: null,
  label: 'Edge actions',
  children: null,
};
const comboboxPanel: ComponentProps<typeof Combobox.Panel> = { children: null };

const popups: Record<string, ReactElement> = {
  tooltip: createElement(Tooltip, tooltip),
  popover: createElement(Popover, popover),
  menu: createElement(Menu, menu),
  pointerMenu: createElement(PointerMenu, pointerMenu),
  select: createElement(Select, {
    value: 'a',
    onValueChange: () => {},
    items: [{ value: 'a', label: 'Alpha' }],
    ariaLabel: 'Hull',
  }),
  combobox: createElement(Combobox.Root, { items: [] }, createElement(Combobox.Panel, comboboxPanel)),
};

/** Renders every popup, optionally under a provider, and returns the container each Portal got. */
function portalContainers(container?: HTMLElement | null): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(popups).map(([name, popup]) => {
      portal.containers.length = 0;
      renderToStaticMarkup(
        container === undefined
          ? popup
          : createElement(OverlayPortalContainerProvider, { container }, popup),
      );
      expect(portal.containers, name).toHaveLength(1);
      return [name, portal.containers[0]];
    }),
  );
}

test('every popup portals into the enclosing dialog popup, and to the default node outside one', () => {
  const dialogPopup = { nodeName: 'DIV' } as unknown as HTMLElement;
  const inDialog = portalContainers(dialogPopup);
  for (const name of Object.keys(popups)) {
    expect(inDialog[name], name).toBe(dialogPopup);
  }

  // Base UI reads container={null} as "wait", so the dialog's first frame,
  // before its popup element exists, and pages without a dialog both pass undefined.
  const everyUndefined = Object.fromEntries(Object.keys(popups).map((name) => [name, undefined]));
  expect(portalContainers(null)).toStrictEqual(everyUndefined);
  expect(portalContainers()).toStrictEqual(everyUndefined);
});
