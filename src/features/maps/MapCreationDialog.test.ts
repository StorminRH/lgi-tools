import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    labelledBy,
  }: {
    children: React.ReactNode;
    labelledBy?: string;
  }) =>
    createElement('div', { role: 'dialog', 'aria-labelledby': labelledBy }, children),
  DialogClose: ({ children }: { children: React.ReactNode }) =>
    createElement('button', null, children),
  DialogDescription: ({ children, ...props }: { children: React.ReactNode }) =>
    createElement('p', props, children),
  DialogTitle: ({ children, ...props }: { children: React.ReactNode }) =>
    createElement('h2', props, children),
}));

vi.mock('./CharacterSearchControl', () => ({
  CharacterSearchControl: () => createElement('div', { 'data-character-search': '' }),
}));

vi.mock('./AccessListEditor', () => ({
  AccessListEditor: () => createElement('div', { 'data-access-editor': '' }),
}));

import { MapCreationDialog } from './MapCreationDialog';

describe('MapCreationDialog', () => {
  it('keeps the dialog labelled by a mounted title in the editing phase', () => {
    const markup = renderToStaticMarkup(
      createElement(MapCreationDialog, {
        open: true,
        onOpenChange: vi.fn(),
        corporations: [],
      }),
    );

    const labelledBy = /aria-labelledby="([^"]+)"/.exec(markup)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(markup).toContain(`id="${labelledBy}"`);
    expect(markup).toContain('Create map');
    expect(markup).not.toContain('data-map-creation-interstitial');
  });
});
