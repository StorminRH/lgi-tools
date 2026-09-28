import { expect, test } from 'vitest';
import { deriveStripView, stripPreferenceBinding } from './character-strip-view';
import type { PanelCharacter } from './live-character-card';
import { stripDimmedDef } from '@/lib/preferences';
import type { CharacterStripSpec } from '@/platform/page-settings/types';

const character = (characterId: number, needsReconnect = false): PanelCharacter => ({
  characterId,
  name: `Char ${characterId}`,
  portraitUrl: `https://example.test/${characterId}.png`,
  needsReconnect,
});

const strip: CharacterStripSpec = { surfaceId: 'jobs' };

test('a declared strip binds the registered dimmed-set and an undeclared strip binds nothing', () => {
  const binding = stripPreferenceBinding(strip, [7, 8]);
  expect(binding.def).toBe(stripDimmedDef('jobs'));
  expect(binding.serverValue).toEqual([7, 8]);

  const absent = stripPreferenceBinding(undefined, [7, 8]);
  expect(absent.def).toBe(stripDimmedDef(undefined));
  expect(absent.serverValue).toBeUndefined();
});

test('dims healthy pilots on a strip, notices when none stay lit, and names a failed load', () => {
  const untouched = [character(1), character(2, true)];
  const plain = deriveStripView(undefined, untouched, [1], false);
  expect(plain).toMatchObject({ hasStrip: false, visible: untouched, showEmptyNotice: false });

  const characters = [character(1), character(2, true), character(3)];
  const view = deriveStripView(strip, characters, [1], false);
  expect(view.hasStrip).toBe(true);
  expect(view.visible).toEqual([character(2, true), character(3)]);
  expect(view.showEmptyNotice).toBe(false);
  expect(deriveStripView(strip, [character(1)], [1], false).showEmptyNotice).toBe(true);
  expect(deriveStripView(undefined, [], [], false).showEmptyNotice).toBe(false);

  expect(deriveStripView(strip, [], [], true, 'Couldn’t load.').syncCaption).toBe('Loading…');
  expect(deriveStripView(strip, [], [], false, 'Couldn’t load.').syncCaption).toBe('Couldn’t load.');
  expect(deriveStripView(strip, [], [], false, null).syncCaption).toBe('Synced from ESI on view');
});
