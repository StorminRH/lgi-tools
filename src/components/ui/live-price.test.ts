import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LivePrice, livePriceTransition } from './live-price';

describe('LivePrice', () => {
  it('marks the in-progress seed without treating first mount as an update', () => {
    const html = renderToStaticMarkup(createElement(LivePrice, { value: '12.4M ISK', pending: true }));
    expect(html).toContain('data-price-state="pending"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('price-live');
    expect(html).toContain('price-pending');
    expect(livePriceTransition(null, { value: '12.4M ISK', pending: true })).toBe('none');
  });

  it('replays confirmation when pending settles even if the value is unchanged', () => {
    expect(
      livePriceTransition(
        { value: '12.4M ISK', pending: true },
        { value: '12.4M ISK', pending: false },
      ),
    ).toBe('confirm');
  });

  it('does not flash a settled initial mount and does replay a later value change', () => {
    expect(livePriceTransition(null, { value: '12.4M ISK', pending: false })).toBe('none');
    expect(
      livePriceTransition(
        { value: '12.4M ISK', pending: false },
        { value: '12.8M ISK', pending: false },
      ),
    ).toBe('confirm');
  });

  it('defines static reduced-motion states for pending and confirmation', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.price-pending[\s\S]*?animation: none/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.price-flash[\s\S]*?animation: none/,
    );
  });

  it('defines pending pulse and confirmed signal animations without a decorative line', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toContain('@keyframes price-pending');
    expect(css).toContain('@keyframes price-flash');
    expect(css).not.toContain('price-pending-scan');
    expect(css).not.toContain('price-confirm-line');
  });
});
