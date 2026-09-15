import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MarkInfo } from './chrome-glyph';
import { NodeMark, TitleMetric } from './chrome-mark';

const BARE: MarkInfo = { kind: 'bare' };
const PILOT_COUNT: MarkInfo = {
  kind: 'count',
  value: 2,
  dataKey: 'data-pilot-presence-count',
};
const BARE_COUNT: MarkInfo = { kind: 'count', value: 3 };

describe('NodeMark', () => {
  it('paints a 14px currentColor glyph in the face tone', () => {
    const html = renderToStaticMarkup(
      createElement(NodeMark, {
        glyph: 'combat-reticle',
        tone: 'red',
        info: BARE,
      }),
    );
    expect(html).toContain('size-icon-sm');
    expect(html).toContain('text-tone-red');
    expect(html).toContain('<svg');
    expect(html).toContain('fill="none"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).not.toContain('text-isk');
    expect(html).not.toContain('data-pilot-presence-count');
  });

  it('shows a muted count when the token carries one', () => {
    const html = renderToStaticMarkup(
      createElement(NodeMark, {
        glyph: 'pilot',
        tone: 'green',
        info: PILOT_COUNT,
      }),
    );
    expect(html).toContain('text-isk');
    expect(html).toContain('fill-rule="evenodd"');
    expect(html).toContain('data-pilot-presence-count');
    expect(html).toContain('>2<');
    expect(html).toContain('text-muted');
  });

  it('omits a count hook when the token has no data key', () => {
    const html = renderToStaticMarkup(
      createElement(NodeMark, {
        glyph: 'pilot',
        tone: 'green',
        info: BARE_COUNT,
      }),
    );
    expect(html).toContain('>3<');
    expect(html).not.toContain('data-pilot-presence-count');
  });
});

describe('chrome catalog paint', () => {
  it('draws every vector glyph through NodeMark', () => {
    const faces = [
      { glyph: 'hacking-chip', tone: 'blue' },
      { glyph: 'combat-reticle', tone: 'red' },
      { glyph: 'pilot', tone: 'green' },
      { glyph: 'market', tone: 'yellow' },
    ] as const;
    for (const face of faces) {
      const html = renderToStaticMarkup(
        createElement(NodeMark, { ...face, info: BARE }),
      );
      expect(html).toContain('<svg');
      expect(html).toContain('viewBox="0 0 16 16"');
    }
  });
});

describe('TitleMetric', () => {
  it('pairs a toned market glyph with a muted caption', () => {
    const html = renderToStaticMarkup(
      createElement(TitleMetric, {
        glyph: 'market',
        tone: 'yellow',
        caption: 'Jita 5',
        dataAttr: 'data-chain-node-hub',
      }),
    );
    expect(html).toContain('data-chain-node-hub');
    expect(html).toContain('>Jita 5<');
    expect(html).toContain('text-tone-yellow');
    expect(html).toContain('text-muted');
    expect(html).toContain('size-icon-sm');
    expect(html).toContain('<svg');
  });
});
