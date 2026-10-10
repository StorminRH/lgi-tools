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
    Close: ({ children, 'aria-label': label }: { children: ReactNode; 'aria-label'?: string }) =>
      createElement('button', { 'aria-label': label }, children),
    Title: ({ children, id }: { children: ReactNode; id?: string }) => createElement('h2', { id }, children),
    Description: ({ children }: { children: ReactNode }) => createElement('p', null, children),
  },
}));

import { Dialog, DialogHeader } from './dialog';

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

test('dialog header names its close button and draws the close mark as a decorative icon', () => {
  const header = {
    titleId: 'map-access-title',
    title: 'Manage Alpha',
    closeLabel: 'Close map access',
  };
  const html = renderToStaticMarkup(
    createElement(DialogHeader, { ...header, description: 'Grant or revoke access.' }),
  );
  expect(html).toContain('<h2 id="map-access-title">Manage Alpha</h2><p>Grant or revoke access.</p>');
  expect(html).toMatch(/<button aria-label="Close map access"><svg aria-hidden="true"[^>]*><path [^>]*><\/path><\/svg><\/button>/);

  const bare = renderToStaticMarkup(createElement(DialogHeader, header));
  expect(bare).toContain('<h2 id="map-access-title">Manage Alpha</h2></div>');
  expect(bare).toMatch(/<button aria-label="Close map access"><svg aria-hidden="true"/);
});
