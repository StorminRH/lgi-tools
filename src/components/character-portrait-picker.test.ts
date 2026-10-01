import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('./character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) => createElement('img', { alt: name }),
}));

import { CharacterPortraitPicker, portraitToggleChange } from './character-portrait-picker';

test('portraitToggleChange names the one portrait a group change flipped', () => {
  const selected = new Set([1, 2]);
  expect(portraitToggleChange(selected, ['1', '2', '3'])).toEqual({ characterId: 3, selected: true });
  expect(portraitToggleChange(selected, ['2'])).toEqual({ characterId: 1, selected: false });
  expect(portraitToggleChange(selected, ['2', '1'])).toBeNull();
});

test('CharacterPortraitPicker presses the chosen portraits', () => {
  const markup = renderToStaticMarkup(createElement(CharacterPortraitPicker, {
    label: 'Your characters',
    characters: [{ characterId: 1, name: 'Main' }, { characterId: 2, name: 'Alt' }],
    selectedIds: new Set([2]),
    onToggle: vi.fn(),
  }));
  expect(markup).toContain('aria-label="Your characters"');
  expect(markup).toMatch(/aria-pressed="false"[^>]*aria-label="Main"/);
  expect(markup).toMatch(/aria-pressed="true"[^>]*aria-label="Alt"/);
});
