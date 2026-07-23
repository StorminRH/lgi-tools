import { describe, expect, it } from 'vitest';
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

const strip: CharacterStripSpec = { surfaceId: 'skills' };

describe('stripPreferenceBinding', () => {
  it('offers the surface def and the first-paint dimmed set when a strip is declared', () => {
    const binding = stripPreferenceBinding(strip, [7, 8]);
    expect(binding.def).toEqual(stripDimmedDef('skills'));
    expect(binding.serverValue).toEqual([7, 8]);
  });

  it('falls back to the sentinel def and offers no serverValue without a strip', () => {
    const binding = stripPreferenceBinding(undefined, [7, 8]);
    expect(binding.def).toEqual(stripDimmedDef(undefined));
    expect(binding.serverValue).toBeUndefined();
  });
});

describe('deriveStripView', () => {
  it('without a strip leaves the character list untouched — today’s render exactly', () => {
    const characters = [character(1), character(2, true)];
    const view = deriveStripView(undefined, characters, [1], false);
    expect(view.hasStrip).toBe(false);
    expect(view.visible).toEqual(characters);
    expect(view.showEmptyNotice).toBe(false);
  });

  it('with a strip drops dimmed healthy characters and keeps the full list off the filter', () => {
    const characters = [character(1), character(2, true), character(3)];
    const view = deriveStripView(strip, characters, [1], false);
    expect(view.hasStrip).toBe(true);
    expect(view.visible).toEqual([character(2, true), character(3)]);
    expect(view.showEmptyNotice).toBe(false);
  });

  it('shows the all-hidden notice only when a strip leaves nothing lit', () => {
    const characters = [character(1)];
    expect(deriveStripView(strip, characters, [1], false).showEmptyNotice).toBe(true);
    // no strip → no notice even when the (unfiltered) list would be empty
    expect(deriveStripView(undefined, [], [], false).showEmptyNotice).toBe(false);
    // strip but something stays lit → no notice
    expect(deriveStripView(strip, [character(1), character(2)], [1], false).showEmptyNotice).toBe(
      false,
    );
  });

  it('renders the loading caption while loading and the steady caption otherwise', () => {
    expect(deriveStripView(strip, [], [], true).syncCaption).toBe('Loading…');
    expect(deriveStripView(strip, [], [], false).syncCaption).toBe('Synced from ESI on view');
  });
});
