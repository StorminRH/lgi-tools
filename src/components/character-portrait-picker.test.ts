import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('./character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) => createElement('img', { alt: name }),
}));

import { CharacterPortraitPicker, toggleCharacterId } from './character-portrait-picker';

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

test('CharacterPortraitPicker names portraits by itemLabel and outlines reconnects only when asked', () => {
  const characters = [
    { characterId: 1, name: 'Main', needsLocationReconnect: true },
    { characterId: 2, name: 'Alt', needsLocationReconnect: false },
  ];
  const plain = renderToStaticMarkup(createElement(CharacterPortraitPicker, {
    label: 'Your characters',
    characters,
    selectedIds: new Set([2]),
    onToggle: vi.fn(),
  }));
  expect(plain).toMatch(/aria-label="Main" title="Main"/);
  expect(plain).not.toContain('data-tracking-reconnect');

  const itemLabel = vi.fn((character: { name: string }, selected: boolean) =>
    `${selected ? 'Drop' : 'Add'} ${character.name}`);
  const tracking = renderToStaticMarkup(createElement(CharacterPortraitPicker, {
    label: 'Tracking',
    characters,
    selectedIds: new Set([2]),
    onToggle: vi.fn(),
    itemLabel,
    markLocationReconnect: true,
  }));
  expect(itemLabel).toHaveBeenCalledWith(characters[0], false);
  expect(itemLabel).toHaveBeenCalledWith(characters[1], true);
  expect(tracking).toMatch(/aria-pressed="false"[^>]*aria-label="Add Main" title="Add Main"[^>]*data-tracking-reconnect="true"/);
  expect(tracking).toMatch(/aria-pressed="true"[^>]*aria-label="Drop Alt"/);
  expect(tracking.match(/data-tracking-reconnect/g)).toHaveLength(1);
});

test('CharacterPortraitPicker reports the one portrait a group change flipped', () => {
  const onToggle = vi.fn();
  const characters = [{ characterId: 1, name: 'Main' }, { characterId: 2, name: 'Alt' }];
  const added = CharacterPortraitPicker({
    label: 'Your characters',
    characters,
    selectedIds: new Set([99, 1]),
    onToggle,
  });

  expect(added.props.value).toEqual(['1']);
  added.props.onValueChange(['1', '2']);
  expect(onToggle).toHaveBeenCalledWith({ characterId: 2, selected: true });

  onToggle.mockClear();
  const group = CharacterPortraitPicker({
    label: 'Your characters',
    characters,
    selectedIds: new Set([99, 1, 2]),
    onToggle,
  });
  expect(group.props.value).toEqual(['1', '2']);
  group.props.onValueChange(['2', '1']);
  expect(onToggle).not.toHaveBeenCalled();
  group.props.onValueChange(['1']);
  expect(onToggle).toHaveBeenCalledWith({ characterId: 2, selected: false });
});

test('toggleCharacterId adds a picked id once and drops an unpicked one', () => {
  expect(toggleCharacterId([1], { characterId: 2, selected: true })).toEqual([1, 2]);
  expect(toggleCharacterId([1, 2], { characterId: 2, selected: true })).toEqual([1, 2]);
  expect(toggleCharacterId([1, 2], { characterId: 1, selected: false })).toEqual([2]);
});
