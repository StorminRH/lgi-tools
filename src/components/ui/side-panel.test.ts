import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { Dialog } from './dialog';

const dialog = vi.hoisted(() => ({ props: null as ComponentProps<typeof Dialog> | null }));
vi.mock('./dialog', () => ({
  Dialog: (props: ComponentProps<typeof Dialog>) => {
    dialog.props = props;
    return createElement('div', { role: 'dialog', 'aria-labelledby': props.labelledBy }, props.children);
  },
  DialogTitle: (props: { id: string; children: ReactNode }) => createElement('h2', props),
  DialogCloseButton: (props: { label: string }) => createElement('button', { 'aria-label': props.label }),
}));

import { SidePanel } from './side-panel';

test('side panel stays mounted, forwards open, and labels itself from its title', () => {
  const onOpenChange = vi.fn();
  const finalFocus = { current: null };
  const props = {
    open: true,
    onOpenChange,
    finalFocus,
    title: 'Custom structures',
    children: createElement('input', { defaultValue: 'Unsaved fitting' }),
  };
  const html = renderToStaticMarkup(createElement(SidePanel, props));

  expect(dialog.props).toMatchObject({ open: true, keepMounted: true, finalFocus });
  dialog.props?.onOpenChange?.(false);
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(html).toContain('value="Unsaved fitting"');
  expect(html).toContain('<button aria-label="Close side panel"></button>');
  const label = html.match(/aria-labelledby="([^"]+)"/)?.[1];
  expect(label).toBeTruthy();
  expect(html.match(/<h2 id="([^"]+)"/)?.[1]).toBe(label);
  expect(html).toContain('>Custom structures</h2>');

  renderToStaticMarkup(createElement(SidePanel, { ...props, open: false }));
  expect(dialog.props).toMatchObject({ open: false, keepMounted: true, finalFocus });
});
