import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

// The view is an account preference; the test picks it the way the store would.
const prefs = vi.hoisted(() => ({ view: 'cards' as 'cards' | 'table' }));
vi.mock('@/components/PreferencesProvider', () => ({
  usePreference: (def: { key: string; fallback: unknown }) => [
    def.key === 'sites.view' ? prefs.view : def.fallback,
    () => {},
  ],
}));

import { SitesFilterLayout, SitesResults, SitesViewTools } from './SitesFilterLayout';

function markup(view: 'cards' | 'table' = 'cards') {
  prefs.view = view;
  const cards = [
    {
      meta: { id: 1, type: 'combat' as const, clsSet: ['C1' as const] },
      node: createElement('div', { 'data-site-card': true }),
    },
  ];
  return renderToStaticMarkup(
    createElement(SitesFilterLayout, {
      sites: cards.map((card) => card.meta),
      total: 1,
      tools: createElement(SitesViewTools),
    }, createElement(SitesResults, {
      cards,
      table: createElement('div', { 'data-sites-table': true }),
    })),
  );
}

test('the rail names the page, labels its filter groups, presses toggles, announces the result count, and switches the results between cards and table', () => {
  const html = markup();
  expect(html).toContain('<h1 class="sr-only">Wormhole sites</h1>');
  expect((html.match(/aria-pressed=/g) ?? []).length).toBe(15);
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('aria-pressed="false"');
  expect((html.match(/role="group"/g) ?? []).length).toBe(4);
  expect(html).toContain('aria-label="Filter by class"');
  expect(html).toContain('aria-label="Filter by site type"');
  expect(html).toContain('aria-label="Site detail behavior"');
  expect(html).toContain('aria-label="Sites view"');
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain('data-site-card="true"');
  expect(html).not.toContain('data-sites-table="true"');

  const table = markup('table');
  expect(table).toContain('data-sites-table="true"');
  expect(table).not.toContain('data-site-card="true"');
});
