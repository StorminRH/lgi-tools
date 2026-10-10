import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const base = vi.hoisted(() => ({
  onOpenChange: null as ((open: boolean) => void) | null,
}));
vi.mock('@base-ui/react/dialog', () => ({
  Dialog: {
    Root: ({ children, onOpenChange }: { children: ReactNode; onOpenChange: (open: boolean) => void }) => {
      base.onOpenChange = onOpenChange;
      return children;
    },
    Portal: ({ children }: { children: ReactNode }) => children,
    Backdrop: () => null,
    Popup: ({ children, 'aria-labelledby': labelledBy }: { children: ReactNode; 'aria-labelledby'?: string }) =>
      createElement('div', { role: 'dialog', 'aria-labelledby': labelledBy }, children),
    Close: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) =>
      createElement('button', { disabled }, children),
    Title: ({ children, id }: { children: ReactNode; id?: string }) => createElement('h2', { id }, children),
    Description: ({ children }: { children: ReactNode }) => createElement('p', null, children),
  },
}));

import { ConfirmDialog } from './confirm-dialog';

const confirm = {
  open: true,
  title: 'Stop sharing?',
  consequence: 'Members lose access.',
  confirmLabel: 'Stop sharing',
  onConfirm: () => undefined,
};

test('confirm dialog is labelled by its title, has no close mark, and names its cancel action', () => {
  const onOpenChange = vi.fn();
  const html = renderToStaticMarkup(createElement(ConfirmDialog, { ...confirm, onOpenChange, busy: false }));
  const label = html.match(/<div role="dialog" aria-labelledby="([^"]+)">/)?.[1];
  expect(label).toBeTruthy();
  expect(html).toContain(`<h2 id="${label}">Stop sharing?</h2>`);
  expect(html).not.toContain('aria-label=');
  expect(html).toMatch(/<button>Cancel<\/button><button type="button" class="[^"]*">Stop sharing<\/button>/);
  base.onOpenChange?.(false);
  expect(onOpenChange).toHaveBeenCalledWith(false);

  const kept = renderToStaticMarkup(
    createElement(ConfirmDialog, { ...confirm, onOpenChange, busy: false, cancelLabel: 'Keep sharing' }),
  );
  expect(kept).toMatch(/<button>Keep sharing<\/button><button type="button" class="[^"]*">Stop sharing<\/button>/);
});

test('a busy confirm dialog disables both actions, shows the busy label, and refuses to close', () => {
  const onOpenChange = vi.fn();
  const html = renderToStaticMarkup(
    createElement(ConfirmDialog, {
      ...confirm,
      onOpenChange,
      busy: true,
      busyLabel: 'Stopping…',
      confirmDisabled: false,
    }),
  );
  expect(html).toMatch(/<button disabled="">Cancel<\/button><button type="button" class="[^"]*" disabled="">Stopping…<\/button>/);
  base.onOpenChange?.(false);
  expect(onOpenChange).not.toHaveBeenCalled();
});
