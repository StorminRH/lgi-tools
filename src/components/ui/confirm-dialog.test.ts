import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('@base-ui/react/dialog', async () => {
  const { StaticBaseDialog } = await import('./__tests__/static-base-dialog');
  return { Dialog: StaticBaseDialog };
});

import { dialogProbe } from './__tests__/static-base-dialog';
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
  const label = html.match(/<div role="dialog" aria-labelledby="([^"]+)"/)?.[1];
  expect(label).toBeTruthy();
  expect(html.match(/<h2 id="([^"]+)"[^>]*>Stop sharing\?<\/h2>/)?.[1]).toBe(label);
  expect(html).not.toContain('aria-label=');
  expect(html).toMatch(/<button type="button">Cancel<\/button><button type="button" class="[^"]*">Stop sharing<\/button>/);
  dialogProbe.root?.onOpenChange?.(false);
  expect(onOpenChange).toHaveBeenCalledWith(false);

  const kept = renderToStaticMarkup(
    createElement(ConfirmDialog, { ...confirm, onOpenChange, busy: false, cancelLabel: 'Keep sharing' }),
  );
  expect(kept).toMatch(/<button type="button">Keep sharing<\/button><button type="button" class="[^"]*">Stop sharing<\/button>/);
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
  expect(html).toMatch(/<button type="button" disabled="">Cancel<\/button><button type="button" class="[^"]*" disabled="">Stopping…<\/button>/);
  dialogProbe.root?.onOpenChange?.(false);
  expect(onOpenChange).not.toHaveBeenCalled();
});
