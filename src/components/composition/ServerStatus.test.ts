import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ServerStatus } from './ServerStatus';

describe('ServerStatus', () => {
  it('keeps the live Tranquility treatment transparent inside the dark nav', () => {
    const html = renderToStaticMarkup(
      createElement(ServerStatus, { status: { state: 'online', players: 28_153 } }),
    );

    expect(html).toContain('border-transparent');
    expect(html).toContain('bg-transparent');
    expect(html).toContain('text-isk');
    expect(html).not.toContain('bg-pill-green-bg');
  });
});
