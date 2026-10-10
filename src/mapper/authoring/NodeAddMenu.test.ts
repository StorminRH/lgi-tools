import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('@base-ui/react/dialog', () => ({
  Dialog: {
    Root: ({ children }: { children: ReactNode }) => children,
    Portal: ({ children }: { children: ReactNode }) => children,
    Backdrop: () => null,
    Popup: ({ children }: { children: ReactNode }) => createElement('div', { role: 'dialog' }, children),
    Close: ({ children, 'aria-label': label }: { children: ReactNode; 'aria-label'?: string }) =>
      createElement('button', { 'aria-label': label }, children),
    Title: ({ children, id }: { children: ReactNode; id?: string }) => createElement('h2', { id }, children),
  },
}));

import { NodeAddMenu } from './NodeAddMenu';

test('the add-connection dialog names its close button and draws the close mark as an icon', () => {
  const html = renderToStaticMarkup(
    createElement(NodeAddMenu, { mapId: 'map-a', menu: null, onMenuOpenChange: vi.fn(), onAdd: vi.fn() }),
  );
  expect(html).toMatch(/<h2 id="[^"]+">Add connection<\/h2><button aria-label="Close add connection"><svg aria-hidden="true"/);
});
