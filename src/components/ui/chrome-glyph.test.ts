import { describe, expect, it } from 'vitest';
import {
  CHROME_GLYPHS,
  chromeToneClass,
  type ChromeGlyph,
  type GlyphNode,
} from './chrome-glyph';

const GLYPHS = [
  'gas-cloud',
  'hacking-chip',
  'combat-reticle',
  'pilot',
  'station',
] as const satisfies readonly ChromeGlyph[];

describe('chrome glyphs', () => {
  it('catalogues a drawing for every chrome glyph', () => {
    for (const glyph of GLYPHS) {
      const nodes: readonly GlyphNode[] = CHROME_GLYPHS[glyph];
      expect(nodes.length).toBeGreaterThan(0);
    }
  });

  it('maps widget tones onto named color classes', () => {
    expect(chromeToneClass('green')).toBe('text-isk');
    expect(chromeToneClass('teal')).toBe('text-tone-teal');
    expect(chromeToneClass('blue')).toBe('text-tone-blue');
    expect(chromeToneClass('red')).toBe('text-tone-red');
    expect(chromeToneClass('yellow')).toBe('text-tone-yellow');
  });
});
