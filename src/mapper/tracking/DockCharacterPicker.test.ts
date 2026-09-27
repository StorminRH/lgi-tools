import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DockCharacterPicker } from './DockCharacterPicker';
import type { DockCharacterSelection } from './use-tracked-system';

vi.mock('@/components/use-account-characters', () => ({
  useAccountCharacters: () => [
    {
      characterId: 7,
      name: 'Alpha Pilot',
      portraitUrl: '/alpha.png',
      needsReconnect: false,
      needsLocationReconnect: false,
    },
  ],
}));

vi.mock('@/components/use-entity-names', () => ({
  useEntityNames: (ids: readonly number[]) =>
    Object.fromEntries(ids.map((id) => [String(id), `Named ${id}`])),
}));

vi.mock('../windows/use-system-label', () => ({
  useSystemLabel: (systemId: number | null) =>
    systemId === null ? null : { name: `J${systemId}` },
}));

vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) => createElement('img', { alt: name }),
}));

vi.mock('@/components/ui/menu', () => {
  const passthrough = ({ children }: { children?: ReactNode }) =>
    createElement('div', null, children);
  return {
    Menu: ({ label, trigger, children }: { label: string; trigger: ReactNode; children: ReactNode }) =>
      createElement('div', { 'aria-label': label }, trigger, children),
    MenuRadioGroup: ({ value, children }: { value: number; children: ReactNode }) =>
      createElement('div', { 'data-value': value }, children),
    MenuRadioItem: ({ value, children }: { value: number; children: ReactNode }) =>
      createElement('div', { 'data-item': value }, children),
    MenuRadioItemIndicator: passthrough,
    MenuSeparator: () => createElement('hr'),
    menuRow: '',
    menuSeparator: '',
  };
});

function selection(partial: Partial<DockCharacterSelection>): DockCharacterSelection {
  return {
    target: { kind: 'ready', systemId: 31_000_001, characterId: 7 },
    mode: 'auto',
    pinnedCharacterId: null,
    characters: [
      { characterId: 7, systemId: 31_000_001, lastMovementAt: 900 },
      { characterId: 8, systemId: null, lastMovementAt: null },
    ],
    pin: () => undefined,
    ...partial,
  };
}

describe('DockCharacterPicker', () => {
  it('names the followed character in Auto and lists each tracked character with its system', () => {
    const markup = renderToStaticMarkup(
      createElement(DockCharacterPicker, { selection: selection({}) }),
    );
    expect(markup).toContain('Current system follows Auto (Alpha Pilot). Choose character');
    expect(markup).toContain('data-value="0"');
    expect(markup).toContain('J31000001');
    expect(markup).toContain('Named 8');
    expect(markup).toContain('Offline');
    expect(markup).not.toContain('data-dock-pinned-badge');
  });

  it('shows the pinned character alone and checks its row', () => {
    const markup = renderToStaticMarkup(
      createElement(DockCharacterPicker, {
        selection: selection({ mode: 'pinned', pinnedCharacterId: 7 }),
      }),
    );
    expect(markup).toContain('Current system follows Alpha Pilot. Choose character');
    expect(markup).toContain('data-value="7"');
    expect(markup).toContain('data-dock-pinned-badge');
  });

  it('renders nothing without tracked characters', () => {
    expect(
      renderToStaticMarkup(
        createElement(DockCharacterPicker, {
          selection: selection({ target: { kind: 'none' }, characters: [] }),
        }),
      ),
    ).toBe('');
  });
});
