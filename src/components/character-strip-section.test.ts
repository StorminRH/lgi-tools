import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { PanelCharacter } from '@/platform/auth/panel-character';

const h = vi.hoisted(() => ({
  dimmed: [] as number[],
  setDimmed: vi.fn(),
  preference: vi.fn(),
  strip: vi.fn(),
}));

vi.mock('./PreferencesProvider', () => ({
  usePreference: (...args: unknown[]) => {
    h.preference(...args);
    return [h.dimmed, h.setDimmed];
  },
}));
vi.mock('./character-strip', () => ({
  CharacterStrip: (props: unknown) => {
    h.strip(props);
    return createElement('div', { 'data-tracking': true });
  },
}));

import { CharacterStripSection } from './character-strip-section';

const characters: PanelCharacter[] = [
  { characterId: 1, name: 'Pilot One', portraitUrl: '/one.png', needsReconnect: false },
  { characterId: 2, name: 'Pilot Two', portraitUrl: '/two.png', needsReconnect: false },
];

function render(props: Partial<Omit<Parameters<typeof CharacterStripSection>[0], 'children'>> = {}) {
  return renderToStaticMarkup(CharacterStripSection({
    heading: 'Personal jobs',
    characters,
    ...props,
    children: (visible) => createElement('p', null, visible.map((c) => c.name).join(', ')),
  }));
}

test('without a strip every pilot stays visible; a strip hides dimmed pilots, forwards portrait changes to its preference, explains when all are hidden, and a failure shows above the cards', () => {
  h.dimmed = [1];
  const plain = render();
  expect(plain).toContain('aria-label="Personal jobs"');
  expect(plain).toContain('Pilot One, Pilot Two');
  expect(plain).not.toContain('Every character is hidden');
  expect(h.strip).not.toHaveBeenCalled();

  const stripped = render({ strip: { surfaceId: 'jobs' } });
  expect(stripped).toContain('<p>Pilot Two</p>');
  expect(stripped).not.toContain('Every character is hidden');
  expect(h.preference).toHaveBeenCalledWith(expect.objectContaining({ key: 'strip.jobs.dimmed' }));
  const props = h.strip.mock.calls[0]![0];
  expect(props.characters).toEqual(characters);
  props.onChange([2]);
  expect(h.setDimmed).toHaveBeenCalledWith([2]);

  h.dimmed = [1, 2];
  const hidden = render({ strip: { surfaceId: 'jobs' } });
  expect(hidden).toContain('Every character is hidden here');
  expect(hidden).toContain('<p></p>');

  h.dimmed = [];
  const failed = render({ strip: { surfaceId: 'jobs' }, failure: createElement('button', null, 'Retry jobs') });
  expect(failed).toContain('Retry jobs');
  expect(failed.indexOf('Retry jobs')).toBeLessThan(failed.indexOf('Pilot One, Pilot Two'));
});
