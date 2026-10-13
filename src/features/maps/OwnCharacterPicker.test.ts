import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { OwnCharacterPicker } from './OwnCharacterPicker';

test('the picker shows the shared loading label until the characters arrive, then the named portrait group', () => {
  const render = (characters: Parameters<typeof OwnCharacterPicker>[0]['characters']) =>
    renderToStaticMarkup(
      createElement(OwnCharacterPicker, {
        characters,
        selectedIds: new Set([42]),
        onToggle: vi.fn(),
        hint: 'Pick who tracks this map.',
      }),
    );

  const loading = render(null);
  expect(loading).toContain(
    '<span class="inline-flex items-center font-ui text-ui text-muted">Loading your characters…</span>',
  );
  expect(loading).not.toContain('role="group"');

  const ready = render([{ characterId: 42, name: 'Scout' }]);
  expect(ready).toMatch(/<div [^>]*role="group" aria-label="Your characters"/);
  expect(ready).toMatch(/<button [^>]*aria-pressed="true" aria-label="Scout"/);
  expect(ready).not.toContain('Loading your characters…');

  for (const html of [loading, ready]) {
    const hintId = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(html).toContain(`<p id="${hintId}" class="font-ui text-label text-faint">Pick who tracks this map.</p>`);
  }
});
