import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

interface RootProps {
  open: boolean;
  modal: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}
interface PortalProps { keepMounted: boolean; children: ReactNode }
interface PopupProps {
  initialFocus?: unknown;
  finalFocus?: unknown;
  'aria-labelledby'?: string;
  children: ReactNode;
}

const base = vi.hoisted(() => ({
  root: null as RootProps | null,
  portal: null as PortalProps | null,
  popup: null as PopupProps | null,
}));
vi.mock('@base-ui/react/dialog', () => ({
  Dialog: {
    Root: (props: RootProps) => {
      base.root = props;
      return props.children;
    },
    Portal: (props: PortalProps) => {
      base.portal = props;
      return props.children;
    },
    Backdrop: () => null,
    Popup: (props: PopupProps) => {
      base.popup = props;
      return createElement('div', null, props.children);
    },
    Close: ({
      children,
      'aria-label': label,
      disabled,
    }: {
      children: ReactNode;
      'aria-label'?: string;
      disabled?: boolean;
    }) => createElement('button', { 'aria-label': label, disabled }, children),
    Title: ({ children, id, className }: { children: ReactNode; id?: string; className?: string }) =>
      createElement('h2', { id, className }, children),
    Description: ({ children }: { children: ReactNode }) => createElement('p', null, children),
  },
}));

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
  expect(base.portal?.keepMounted).toBe(true);
  expect(base.root).toMatchObject({ open: false, modal: true });
  expect(base.popup).toMatchObject({ initialFocus, finalFocus, 'aria-labelledby': 'structure-panel-title' });
  base.root?.onOpenChange(true);
  expect(onOpenChange).toHaveBeenCalledWith(true);

  const transient = { open: true, children: 'Transient dialog' };
  renderToStaticMarkup(createElement(Dialog, transient));
  expect(base.portal?.keepMounted).toBe(false);
  expect(base.root).toMatchObject({ open: true, modal: true });
  expect(base.popup).not.toHaveProperty('aria-labelledby');
  expect(() => base.root?.onOpenChange(false)).not.toThrow();
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
  expect(html).toMatch(/<h2 id="map-access-title" class="[^"]*\bmin-w-0 break-words\b[^"]*">Manage Alpha<\/h2><p>Grant or revoke access.<\/p>/);
  expect(html).toMatch(/<button aria-label="Close map access"><svg aria-hidden="true"[^>]*><path [^>]*><\/path><\/svg><\/button>/);

  const busy = renderToStaticMarkup(createElement(DialogHeader, { ...header, closeDisabled: true }));
  expect(busy).toMatch(/Manage Alpha<\/h2><\/div><button aria-label="Close map access" disabled=""><svg aria-hidden="true"/);

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
