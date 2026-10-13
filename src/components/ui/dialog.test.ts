import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('@base-ui/react/dialog', async () => {
  const { StaticBaseDialog } = await import('./__tests__/static-base-dialog');
  return { Dialog: StaticBaseDialog };
});

import { dialogProbe } from './__tests__/static-base-dialog';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from './dialog';

test('dialog keeps the portal mounted only when requested and preserves modal focus controls', () => {
  const onOpenChange = vi.fn();
  const initialFocus = { current: null };
  const finalFocus = { current: null };
  const props = {
    open: false,
    keepMounted: true,
    onOpenChange,
    initialFocus,
    finalFocus,
    labelledBy: 'structure-panel-title',
    children: 'Fitting editor',
  };
  renderToStaticMarkup(createElement(Dialog, props));
  expect(dialogProbe.portal?.keepMounted).toBe(true);
  expect(dialogProbe.root).toMatchObject({ open: false, modal: true });
  expect(dialogProbe.popup).toMatchObject({ initialFocus, finalFocus, 'aria-labelledby': 'structure-panel-title' });
  dialogProbe.root?.onOpenChange?.(true);
  expect(onOpenChange).toHaveBeenCalledWith(true);

  const transient = { open: true, children: 'Transient dialog' };
  renderToStaticMarkup(createElement(Dialog, transient));
  expect(dialogProbe.portal?.keepMounted).toBe(false);
  expect(dialogProbe.root).toMatchObject({ open: true, modal: true });
  expect(dialogProbe.popup).not.toHaveProperty('aria-labelledby');
  expect(() => dialogProbe.root?.onOpenChange?.(false)).not.toThrow();
});

test('dialog header names its close button, greys it while work runs, and leaves it out unnamed', () => {
  const header = {
    titleId: 'map-access-title',
    title: 'Manage Alpha',
    closeLabel: 'Close map access',
  };
  const html = renderToStaticMarkup(
    createElement(DialogHeader, { ...header, description: 'Grant or revoke access.' }),
  );
  expect(html).toMatch(/<h2 id="map-access-title" class="[^"]*\bmin-w-0 break-words\b[^"]*">Manage Alpha<\/h2><p class="[^"]*\btext-muted\b[^"]*">Grant or revoke access.<\/p>/);
  expect(html).toMatch(/<button type="button" aria-label="Close map access"><svg aria-hidden="true"[^>]*><path [^>]*><\/path><\/svg><\/button>/);

  const busy = renderToStaticMarkup(createElement(DialogHeader, { ...header, closeDisabled: true }));
  expect(busy).toMatch(/Manage Alpha<\/h2><\/div><button type="button" aria-label="Close map access" disabled=""><svg aria-hidden="true"/);

  const confirm = renderToStaticMarkup(
    createElement(DialogHeader, { titleId: 'confirm-title', title: 'Delete map?', size: 'h3', tone: 'danger' }),
  );
  expect(confirm).toMatch(/<h2 id="confirm-title" class="[^"]*\btext-h3\b[^"]*\btext-pill-red-text\b[^"]*">Delete map\?<\/h2><\/div><\/header>$/);
  expect(confirm).not.toContain('<button');
});

test('dialog body takes a gap override and the footer aligns its actions to the end or splits them', () => {
  const bodyProps = { className: 'gap-5', 'data-afk-dialog': '' };
  const body = renderToStaticMarkup(createElement(DialogBody, bodyProps, 'Fields'));
  expect(body).toMatch(/^<div class="flex flex-col px-4 py-4 gap-5" data-afk-dialog="">Fields<\/div>$/);

  const end = renderToStaticMarkup(createElement(DialogFooter, null, 'Done'));
  expect(end).toMatch(/^<footer class="[^"]*\bborder-t\b[^"]*\bjustify-end">Done<\/footer>$/);
  const between = renderToStaticMarkup(createElement(DialogFooter, { align: 'between' }, 'Restore'));
  expect(between).toMatch(/\bjustify-between">Restore<\/footer>$/);
  expect(between).not.toContain('justify-end');
});
