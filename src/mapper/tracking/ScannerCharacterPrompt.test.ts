import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ScannerCharacterPrompt } from './ScannerCharacterPrompt';

vi.mock('./use-character-identities', () => ({
  useCharacterIdentities: () => (id: number) => ({
    name: id === 7 ? 'Alpha Pilot' : 'Bravo Pilot',
    portraitUrl: undefined,
  }),
}));

vi.mock('../windows/use-system-label', () => ({
  useSystemLabel: (systemId: number | null) =>
    systemId === null ? null : { name: `J${systemId}` },
}));

vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) => createElement('img', { alt: name }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: (props: { children?: ReactNode; onClick?: () => void } & Record<string, unknown>) =>
    createElement('button', { ...props, type: 'button' }, props.children),
}));

const candidates = [
  { characterId: 7, systemId: 31_000_001, lastMovementAt: 1 },
  { characterId: 8, systemId: 31_000_002, lastMovementAt: 2 },
];

describe('ScannerCharacterPrompt', () => {
  it('lists each online character with its system and a cancel action', () => {
    const markup = renderToStaticMarkup(
      createElement(ScannerCharacterPrompt, {
        candidates,
        onPick: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(markup).toContain('Which character scanned this?');
    expect(markup).toContain('data-scanner-character-candidate="7"');
    expect(markup).toContain('Alpha Pilot');
    expect(markup).toContain('J31000002');
    expect(markup).toContain('Cancel');
  });
});
