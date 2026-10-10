import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@base-ui/react/dialog', async () => {
  const { StaticBaseDialog } = await import('@/components/ui/__tests__/static-base-dialog');
  return { Dialog: StaticBaseDialog };
});

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
