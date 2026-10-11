import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { CharacterLocationLabel } from './character-location-label';

vi.mock('../windows/use-system-label', () => ({
  useSystemLabel: (systemId: number | null) =>
    systemId === 31_000_001 ? { name: 'J100001' } : null,
}));

vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name, className }: { name: string; className?: string }) =>
    createElement('img', { alt: name, className }),
}));

function label(systemId: number | null, sublineTone: 'faint' | 'muted'): string {
  return renderToStaticMarkup(
    createElement(CharacterLocationLabel, {
      characterId: 7,
      identity: { name: 'Alpha Pilot', portraitUrl: undefined },
      systemId,
      sublineTone,
    }),
  );
}

/** The portrait's class list and the name and subline text, in render order. */
function parts(markup: string) {
  const portrait = /<img alt="Alpha Pilot" class="([^"]*)"/.exec(markup)?.[1] ?? null;
  const lines = [...markup.matchAll(/<span class="([^"]*)">([^<]*)<\/span>/g)].map(
    ([, className, text]) => ({ text, tone: className?.match(/text-(faint|muted)/)?.[1] ?? null }),
  );
  return { portrait, lines };
}

test('a tracked character reads its system name, its system id while the name loads, or Offline dimmed', () => {
  expect(parts(label(31_000_001, 'muted'))).toEqual({
    portrait: '',
    lines: [
      { text: 'Alpha Pilot', tone: null },
      { text: 'J100001', tone: 'muted' },
    ],
  });

  expect(parts(label(31_000_002, 'faint')).lines).toEqual([
    { text: 'Alpha Pilot', tone: null },
    { text: '31000002', tone: 'faint' },
  ]);

  expect(parts(label(null, 'faint'))).toEqual({
    portrait: 'opacity-50',
    lines: [
      { text: 'Alpha Pilot', tone: null },
      { text: 'Offline', tone: 'faint' },
    ],
  });
});
