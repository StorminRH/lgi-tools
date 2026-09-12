import { describe, expect, it } from 'vitest';
import {
  CHROME_GLYPHS,
  chromeToneClass,
  type ChromeGlyph,
  type ChromeTone,
  type GlyphNode,
} from './chrome-glyph';

const GLYPHS = [
  'gas-cloud',
  'hacking-chip',
  'combat-reticle',
  'pilot',
  'market',
] as const satisfies readonly ChromeGlyph[];

describe('chrome glyphs', () => {
  it('catalogues a drawing for every chrome glyph', () => {
    for (const glyph of GLYPHS) {
      const nodes: readonly GlyphNode[] = CHROME_GLYPHS[glyph];
      expect(nodes.length).toBeGreaterThan(0);
    }
  });

  it('cuts pilot as an evenodd ring like the hacking chip', () => {
    for (const glyph of ['hacking-chip', 'pilot'] as const) {
      expect(
        CHROME_GLYPHS[glyph].some(
          (node) => node.kind === 'path' && node.fillRule === 'evenodd',
        ),
      ).toBe(true);
    }
    expect(
      CHROME_GLYPHS.market.every(
        (node) => node.kind !== 'path' || node.fillRule === undefined,
      ),
    ).toBe(true);
  });

  it('traces the official market graph: axes, zigzag trend, endpoint dot', () => {
    const nodes = CHROME_GLYPHS.market;
    expect(nodes).toHaveLength(3);
    const [axes, trend, dot] = nodes;
    expect(axes?.kind).toBe('path');
    if (axes?.kind !== 'path') throw new Error('market axes must be a path');
    expect(axes.fill).toBe('none');
    expect(axes.stroke).toBe('currentColor');
    expect(axes.d).toContain('V');
    expect(axes.d).toContain('H');
    expect(trend?.kind).toBe('path');
    if (trend?.kind !== 'path') throw new Error('market trend must be a path');
    expect(trend.fill).toBe('none');
    expect(trend.stroke).toBe('currentColor');
    expect(trend.d).toContain('L');
    expect(dot?.kind).toBe('circle');
    if (dot?.kind !== 'circle') throw new Error('market dot must be a circle');
    expect(dot.r).toBeGreaterThan(0.9);
    expect(dot.r).toBeLessThan(1.3);
  });

  it('draws gas as a hollow cloud outline', () => {
    const nodes = CHROME_GLYPHS['gas-cloud'];
    expect(nodes).toHaveLength(1);
    const node = nodes[0];
    expect(node?.kind).toBe('path');
    if (node?.kind !== 'path') throw new Error('gas-cloud must be a path');
    expect(node.fill).toBe('none');
    expect(node.stroke).toBe('currentColor');
    expect(node.strokeWidth).toBeGreaterThanOrEqual(1.4);
    expect(node.strokeWidth).toBeLessThanOrEqual(1.6);
    expect(node.d).toContain('H');
    expect(node.d).toContain('a');
  });

  it('maps widget tones onto named color classes', () => {
    expect(chromeToneClass('green' satisfies ChromeTone)).toBe('text-isk');
    expect(chromeToneClass('teal')).toBe('text-tone-teal');
    expect(chromeToneClass('blue')).toBe('text-tone-blue');
    expect(chromeToneClass('red')).toBe('text-tone-red');
    expect(chromeToneClass('yellow')).toBe('text-tone-yellow');
  });
});
