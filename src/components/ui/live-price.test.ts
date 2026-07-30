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
    expect(html).not.toContain('price-flash');
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

  it('defines a one-shot confirm flash without multi-peak or infinite iteration', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toContain('@keyframes price-pending');
    expect(css).toContain('@keyframes price-flash');
    expect(css).toMatch(
      /\.price-flash\s*\{\s*animation:\s*price-flash var\(--transition-duration-price-confirm\) ease-out;/,
    );
    expect(css).not.toMatch(/\.price-flash\s*\{[^}]*infinite/);
    expect(css).not.toContain('price-pending-scan');
    expect(css).not.toContain('price-confirm-line');
    // Single decay: peak at 0%, rest at 100% — no mid-clip bounce stops.
    const flashBlock = css.slice(css.indexOf('@keyframes price-flash'));
    const flashKeyframes = flashBlock.slice(0, flashBlock.indexOf('@media'));
    expect(flashKeyframes).toMatch(/0%\s*\{/);
    expect(flashKeyframes).toMatch(/100%\s*\{/);
    expect(flashKeyframes).not.toMatch(/18%/);
    expect(flashKeyframes).not.toMatch(/42%/);
    expect(flashKeyframes).not.toMatch(/68%/);
  });
});
