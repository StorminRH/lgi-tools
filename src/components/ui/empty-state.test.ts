import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { EmptyState } from './empty-state';

type Kind = 'empty' | 'unavailable' | 'clear' | 'disconnected';

function render(kind?: Kind): string {
  return renderToStaticMarkup(EmptyState({ kind, children: 'Nothing here.' }));
}

// The first path of each glyph, from ./icons.
const GLYPH: Record<Kind, string> = {
  empty: 'M4 13l2.5-7h11',
  unavailable: 'M12 4l9 16H3z',
  clear: 'M5 12.5l4.5 4.5L19 7.5',
  disconnected: '<circle cx="12" cy="12" r="9">',
};

test('draws a different hidden glyph for each kind beside its text, so a failure never reads as no data', () => {
  expect(render()).toContain(GLYPH.empty);
  for (const kind of Object.keys(GLYPH) as Kind[]) {
    const html = render(kind);
    expect(html).toMatch(/<svg aria-hidden="true"/);
    expect(html).toContain('Nothing here.');
    for (const [other, glyph] of Object.entries(GLYPH)) {
      if (other === kind) expect(html).toContain(glyph);
      else expect(html).not.toContain(glyph);
    }
  }
  expect(render('unavailable')).toContain('text-tone-orange');
  expect(render('clear')).toContain('text-isk');
});
