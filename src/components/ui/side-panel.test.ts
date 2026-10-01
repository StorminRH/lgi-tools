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
  DialogClose: (props: { children: ReactNode; 'aria-label': string }) =>
    createElement('button', { 'aria-label': props['aria-label'] }, props.children),
}));

import { SidePanel } from './side-panel';

test.each([false, true])('side panel requests persistent mounting with controlled open=%s and trigger focus restoration', (open) => {
  const onOpenChange = vi.fn();
  const finalFocus = { current: null };
  const props = {
    open,
    onOpenChange,
    finalFocus,
    title: 'Custom structures',
    children: createElement('input', { defaultValue: 'Unsaved fitting' }),
  };
  const html = renderToStaticMarkup(createElement(SidePanel, props));

  expect(dialog.props).toMatchObject({ open, keepMounted: true, finalFocus });
  dialog.props?.onOpenChange?.(false);
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(html).toContain('value="Unsaved fitting"');
  expect(html).toContain('aria-label="Close side panel"');
  const label = html.match(/aria-labelledby="([^"]+)"/)?.[1];
  expect(label).toBeTruthy();
  expect(html.match(/<h2 id="([^"]+)"/)?.[1]).toBe(label);
  expect(html).toContain('>Custom structures</h2>');
});
