import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { SiteMetaStrip } from './SiteMetaStrip';

afterEach(() => {
  vi.restoreAllMocks();
});

test('the server render leaves the price age to the client and never reads the clock', () => {
  const clock = vi.spyOn(Date, 'now');
  const html = renderToStaticMarkup(
    createElement(SiteMetaStrip, {
      source: 'Relic',
      lastPriceUpdate: new Date('2026-10-13T12:00:00Z'),
    }),
  );

  expect(html).toContain('Source</span><span class="text-name font-data">Relic</span>');
  expect(html).toContain('Last price update</span><span class="text-name font-data">—</span>');
  expect(clock).not.toHaveBeenCalled();
});
