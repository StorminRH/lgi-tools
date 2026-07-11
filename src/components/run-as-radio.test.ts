import { describe, expect, it } from 'vitest';
import { buildRadioValue, parseRadioSelection, type BuildCharacter } from './run-as-state';

const character = (id: number): BuildCharacter =>
  ({ characterId: id, name: `Char ${id}`, portraitUrl: '' }) as BuildCharacter;

describe('buildRadioValue', () => {
  it('is the selected character id, or the 0 sentinel when unset', () => {
    expect(buildRadioValue(character(90001))).toBe(90001);
    expect(buildRadioValue(null)).toBe(0);
  });
});

describe('parseRadioSelection', () => {
  it('clears on the 0 sentinel and keeps any real id', () => {
    expect(parseRadioSelection(0)).toBeNull();
    expect(parseRadioSelection(90001)).toBe(90001);
  });
});
