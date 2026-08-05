import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NoMapAccess } from './NoMapAccess';

// ── SC-4 · DC-4 / AC-4 — the calm state's copy and affordances ───────────────
describe('calm no-access state', () => {
  const markup = renderToStaticMarkup(createElement(NoMapAccess));

  it('leads with the lost-access line as its heading, salute intact', () => {
    expect(markup).toContain('data-chain-no-access');
    // HC-4: no retry control here — recovery is the live access subscription
    // flipping back (chain/surface.test.ts owns the copy/spinner negatives).
    expect(markup).not.toMatch(/<button/i);
    expect(markup).toMatch(/<h2[^>]*>\s*You[^<]*lost access to this map/);
    // The house uppercase treatment would render the salute as `O7`, which is not the gesture.
    // Asserted on the h2's parsed class list: a literal like `uppercase tracking-copy` depends on
    // token order and would pass even with `uppercase` present elsewhere in the attribute.
    const heading = /<h2[^>]*class="([^"]*)"/.exec(markup);
    expect(heading, 'the lost-access heading must be an h2 with classes').not.toBeNull();
    expect(heading?.[1]?.split(/\s+/)).not.toContain('uppercase');
    expect(markup).not.toContain('O7');
  });

  it('renders the salute in ISK green, bound to the word before it', () => {
    expect(markup).toMatch(/<span class="text-isk">o7<\/span>/);
    // A non-breaking space, not a plain one: the salute must never wrap onto its own line.
    expect(markup).toContain(`map\u00a0<span class="text-isk">o7</span>`);
  });

  it('states the two ways back without restating the heading', () => {
    expect(markup).toContain('Another map can be opened from the atlas');
    expect(markup).toContain('access can be restored by the');
    expect(markup).not.toMatch(/access lost/i);
  });
});
