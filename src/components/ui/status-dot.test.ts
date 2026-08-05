import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatusDot } from './status-dot';

describe('StatusDot', () => {
  it('joins the status-led idiom with the state class and stays decorative', () => {
    const online = renderToStaticMarkup(createElement(StatusDot, { state: 'online' }));
    expect(online).toContain('status-led');
    expect(online).toContain('online');
    expect(online).toContain('aria-hidden');

    const vip = renderToStaticMarkup(createElement(StatusDot, { state: 'vip' }));
    expect(vip).toContain('vip');
  });

  it('disables the online pulse under reduced motion', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.status-led \{ animation: none; \}/,
    );
  });
});
