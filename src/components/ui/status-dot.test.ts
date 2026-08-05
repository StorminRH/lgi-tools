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

  // The T3-style duty-cycle contract: an always-on LED must hold flat and ramp
  // in discrete steps, never pulse continuously — a continuous ease under the
  // fixed .page-grain overlay costs a viewport re-blend every vsync, idle,
  // on every page.
  it('keeps the online pulse duty-cycled: flat holds, stepped ramps, no ease', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toMatch(
      /\.status-led\.online\s*\{[^}]*animation: status-led-pulse 2\.4s infinite;/,
    );

    const block = css.slice(css.indexOf('@keyframes status-led-pulse'));
    const keyframes = block.slice(0, block.indexOf('@media'));
    // Paired offsets are the flat holds; steps() owns both ramps.
    expect(keyframes).toContain('0%, 40%');
    expect(keyframes).toContain('50%, 90%');
    expect(keyframes).toContain('animation-timing-function: steps(6)');
    expect(keyframes).not.toContain('ease');
  });

  it('defines a static reduced-motion state', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.status-led \{ animation: none; \}/,
    );
  });
});
