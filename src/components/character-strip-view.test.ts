import { expect, test } from 'vitest';
import { deriveStripView } from './character-strip-view';
import type { PanelCharacter } from './live-character-card';
import type { CharacterStripSpec } from '@/platform/page-settings/types';

const character = (characterId: number, needsReconnect = false): PanelCharacter => ({
  characterId,
  name: `Char ${characterId}`,
  portraitUrl: `https://example.test/${characterId}.png`,
  needsReconnect,
});

const strip: CharacterStripSpec = { surfaceId: 'jobs' };

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

  expect(deriveStripView(strip, [], [], true).syncCaption).toBe('Loading…');
  expect(deriveStripView(strip, [], [], false).syncCaption).toBe('Synced from ESI on view');
});
