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
  it('puts aria-pressed on every toggle (6 class chips + 5 type rows + 2 view toggles)', () => {
    const html = markup();
    expect((html.match(/aria-pressed=/g) ?? []).length).toBe(13);
    // The default view ('cards') reports its pressed state; the rest are off.
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('labels the rail filter groups', () => {
    const html = markup();
    expect((html.match(/role="group"/g) ?? []).length).toBe(2);
    expect(html).toContain('aria-label="Filter by class"');
    expect(html).toContain('aria-label="Filter by site type"');
  });

  it('makes the result count a polite live region', () => {
    expect(markup()).toContain('aria-live="polite"');
  });
});
