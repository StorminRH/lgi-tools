import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SitesFilterLayout, SitesResults } from './SitesFilterLayout';

// Regression guard for the PR #111 a11y miss (3.6.7b ledger #1): the filter
// rail's toggle controls must carry the codebase's `aria-pressed` convention
// (mirrors BuildCascade/ConsolidatedBuild), the rail groups must be labelled,
// and the result count must announce live. We assert on the server-rendered
// markup — effects don't run, so this captures the initial-state attributes
// every control emits regardless of interaction. No DOM/testing-library needed.
function markup(initialView: 'cards' | 'table' = 'cards') {
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
    }, createElement(SitesResults, {
      cards,
      table: createElement('div', { 'data-sites-table': true }),
      initialView,
    })),
  );
}

describe('SitesFilterLayout a11y', () => {
  it('labels the filter rail, presses toggles, and announces the result count', () => {
    const html = markup();
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Filter by class"');
    expect(html).toContain('aria-label="Filter by site type"');
    expect(html).toContain('aria-label="Site detail behavior"');
    expect(html).toContain('aria-label="Sites view"');
    expect(html).toContain('aria-live="polite"');
    expect(markup('cards')).not.toContain('data-sites-table="true"');
    expect(markup('table')).toContain('data-sites-table="true"');
  });

  it('keeps meaningful catalogue chrome outside the request-time results leaf', () => {
    const html = renderToStaticMarkup(
      createElement(SitesFilterLayout, {
        sites: [{ id: 1, type: 'combat', clsSet: ['C1'] }],
        total: 1,
      }, createElement('div', { 'data-results-fallback': true })),
    );

    expect(html).toContain('Wormhole Sites');
    expect(html).toContain('aria-label="Filter by class"');
    expect(html).toContain('aria-label="Filter by site type"');
    expect(html).toContain('data-results-fallback="true"');
  });

});
