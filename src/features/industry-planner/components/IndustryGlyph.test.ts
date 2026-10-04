import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IndustryGlyph } from './IndustryGlyph';
import { GemIcon, HourglassIcon } from './MeAdjuster';

describe('CCP industry glyphs', () => {
  it('masks the runs glyph from the local CCP asset', () => {
    const html = renderToStaticMarkup(createElement(IndustryGlyph, { glyph: 'runs', className: 'text-muted' }));
    expect(html).toContain('mask-[url(/icons/ccp/industry-runs.png)]');
    expect(html).toContain('text-muted');
  });

  it('tints ME and TE in their efficiency tone with the glow outside the mask', () => {
    const me = renderToStaticMarkup(createElement(GemIcon, { state: 'owned' }));
    expect(me).toMatch(/^<span[^>]*drop-shadow-\[0_0_4px_var\(--color-evb-glow\)\][^>]*><span[^>]*mask-\[url\(\/icons\/ccp\/industry-me\.png\)\][^>]*text-evb-bright/);
    const te = renderToStaticMarkup(createElement(HourglassIcon, { state: 'unowned' }));
    expect(te).toContain('mask-[url(/icons/ccp/industry-te.png)]');
    expect(te).toContain('text-muted');
    expect(te).not.toContain('drop-shadow');
  });
});
