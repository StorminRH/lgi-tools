import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import type { PanelCharacter } from './live-character-card';

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
    characters,
    loading: false,
    ...props,
    children: (visible) => createElement('p', null, visible.map((c) => c.name).join(', ')),
  }));
}

beforeEach(() => {
  h.dimmed = [];
  vi.clearAllMocks();
});

test('without a tracking strip, all pilots remain visible and a settled read shows its caption', () => {
  h.dimmed = [1];
  const html = render();
  expect(html).toContain('Pilot One, Pilot Two');
  expect(html).toContain('Synced from ESI on view');
  expect(html).not.toContain('Every character is hidden');
  expect(h.strip).not.toHaveBeenCalled();
});

test('a loading strip filters pilots and forwards portrait changes to its preference', () => {
  h.dimmed = [1];
  const html = render({ strip: { surfaceId: 'jobs' }, initialDimmed: [1], loading: true });
  expect(html).toContain('Loading…');
  expect(html).toContain('<p>Pilot Two</p>');
  expect(html).not.toContain('Every character is hidden');
  expect(h.preference).toHaveBeenCalledWith(expect.objectContaining({ key: 'strip.jobs.dimmed' }), { serverValue: [1] });
  const props = h.strip.mock.calls[0]![0];
  expect(props.characters).toEqual(characters);
  props.onChange([2]);
  expect(h.setDimmed).toHaveBeenCalledWith([2]);
});

test('hiding every pilot explains how to restore them; a failure replaces the sync caption', () => {
  h.dimmed = [1, 2];
  const hidden = render({ strip: { surfaceId: 'jobs' } });
  expect(hidden).toContain('Every character is hidden here');
  expect(hidden).toContain('<p></p>');

  h.dimmed = [];
  const failed = render({ strip: { surfaceId: 'jobs' }, failure: createElement('button', null, 'Retry jobs'), loading: true });
  expect(failed).toContain('Retry jobs');
  expect(failed).not.toContain('Loading…');
  expect(failed).not.toContain('Synced from ESI');
  expect(failed).toContain('Pilot One, Pilot Two');
});
