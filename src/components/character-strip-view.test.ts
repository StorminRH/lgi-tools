import { expect, test } from 'vitest';
import { deriveStripView } from './character-strip-view';
import type { PanelCharacter } from '@/platform/auth/panel-character';
import type { CharacterStripSpec } from '@/platform/page-settings/types';

const character = (characterId: number, needsReconnect = false): PanelCharacter => ({
  characterId,
  name: `Char ${characterId}`,
  portraitUrl: `https://example.test/${characterId}.png`,
  needsReconnect,
});

const strip: CharacterStripSpec = { surfaceId: 'jobs' };

test('dims healthy pilots on a strip and notices when none stay lit', () => {
  const untouched = [character(1), character(2, true)];
  const plain = deriveStripView(undefined, untouched, [1]);
  expect(plain).toMatchObject({ hasStrip: false, visible: untouched, showEmptyNotice: false });

  const characters = [character(1), character(2, true), character(3)];
  const view = deriveStripView(strip, characters, [1]);
  expect(view.hasStrip).toBe(true);
  expect(view.visible).toEqual([character(2, true), character(3)]);
  expect(view.showEmptyNotice).toBe(false);
  expect(deriveStripView(strip, [character(1)], [1]).showEmptyNotice).toBe(true);
  expect(deriveStripView(undefined, [], []).showEmptyNotice).toBe(false);
});
