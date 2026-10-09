import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './empty-state';

type Kind = 'empty' | 'unavailable' | 'clear' | 'disconnected';

function render(props: { kind?: Kind; inset?: boolean } = {}): string {
  return renderToStaticMarkup(EmptyState({ ...props, children: 'Nothing here.' }));
}

// The first path of each glyph, from ./icons.
const GLYPH: Record<Kind, string> = {
  empty: 'M4 13l2.5-7h11',
  unavailable: 'M12 4l9 16H3z',
  clear: 'M5 12.5l4.5 4.5L19 7.5',
  disconnected: '<circle cx="12" cy="12" r="9">',
};

describe('EmptyState', () => {
  it('is a padded, divided row with the inbox glyph by default', () => {
    const html = render();
    expect(html).toMatch(/^<div class="flex items-center gap-3 font-ui text-ui text-muted border-b border-border-soft px-3\.5 py-2\.5 last:border-b-0">/);
    expect(html).toContain(GLYPH.empty);
    expect(html).toContain('class="shrink-0 text-faint"');
    expect(html).toContain('<div class="min-w-0">Nothing here.</div>');
  });

  it('draws a different glyph for each kind so a failure never reads as no data', () => {
    for (const kind of Object.keys(GLYPH) as Kind[]) {
      const html = render({ kind });
      for (const [other, glyph] of Object.entries(GLYPH)) {
        if (other === kind) expect(html).toContain(glyph);
        else expect(html).not.toContain(glyph);
      }
    }
    expect(render({ kind: 'unavailable' })).toContain('text-tone-orange');
    expect(render({ kind: 'clear' })).toContain('text-isk');
  });

  it('hides its glyph from screen readers; the text carries the meaning', () => {
    expect(render({ kind: 'unavailable' })).toMatch(/<svg aria-hidden="true"/);
  });

  it('drops the row padding and divider when inset in a padded body', () => {
    const html = render({ inset: true });
    expect(html).toMatch(/^<div class="flex items-center gap-3 font-ui text-ui text-muted">/);
    expect(html).not.toContain('px-3.5');
    expect(html).not.toContain('border-b');
  });
});
