import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SitesFilterLayout } from './SitesFilterLayout';

// Regression guard for the PR #111 a11y miss (3.6.7b ledger #1): the filter
// rail's toggle controls must carry the codebase's `aria-pressed` convention
// (mirrors BuildCascade/ConsolidatedBuild), the rail groups must be labelled,
// and the result count must announce live. We assert on the server-rendered
// markup — effects don't run, so this captures the initial-state attributes
// every control emits regardless of interaction. No DOM/testing-library needed.
function markup() {
  return renderToStaticMarkup(
    createElement(SitesFilterLayout, {
      cards: [],
      table: null,
      total: 0,
      initialView: 'cards',
    }),
  );
}

describe('SitesFilterLayout a11y', () => {
  it('puts aria-pressed on every toggle (6 class chips + 5 type rows + 2 view + 2 detail-mode toggles)', () => {
    const html = markup();
    // The detail-mode toggle (lightbox/expand) only renders in the cards view,
    // which markup() defaults to, so all four segmented buttons are present.
    expect((html.match(/aria-pressed=/g) ?? []).length).toBe(15);
    // The default view ('cards') reports its pressed state; the rest are off.
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('labels every filter and segmented-control group', () => {
    const html = markup();
    expect((html.match(/role="group"/g) ?? []).length).toBe(4);
    expect(html).toContain('aria-label="Filter by class"');
    expect(html).toContain('aria-label="Filter by site type"');
    expect(html).toContain('aria-label="Site detail behavior"');
    expect(html).toContain('aria-label="Sites view"');
  });

  it('makes the result count a polite live region', () => {
    expect(markup()).toContain('aria-live="polite"');
  });
});
