import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/components/ui/dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/dialog')>()),
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
  DialogHeader: ({
    titleId,
    title,
    description,
  }: {
    titleId: string;
    title: React.ReactNode;
    description: React.ReactNode;
  }) =>
    createElement(
      'header',
      null,
      createElement('h2', { id: titleId }, title),
      createElement('p', null, description),
    ),
}));

vi.mock('@/components/use-account-characters', () => ({
  useAccountCharacters: () => [{ characterId: 7, name: 'Creator Main', portraitUrl: 'https://images.evetech.net/characters/7/portrait' }],
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
    expect(markup.indexOf('data-own-character-picker')).toBeLessThan(markup.indexOf('data-access-editor'));
    expect(markup).toContain('aria-label="Creator Main"');
    expect(markup).toContain('Choose at least one of your characters.');
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });
});
