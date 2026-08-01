import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NoMapAccess } from './NoMapAccess';

// ── SC-4 · DC-4 / AC-4 — the calm state's copy and affordances ───────────────
describe('calm no-access state', () => {
  const markup = renderToStaticMarkup(createElement(NoMapAccess));

  it('leads with the lost-access line as its heading, salute intact', () => {
    expect(markup).toContain('data-chain-no-access');
    expect(markup).toMatch(/<h2[^>]*>\s*You[^<]*lost access to this map/);
    // The house uppercase treatment would render the salute as `O7`, which is not the gesture.
    expect(markup).not.toContain('uppercase tracking-copy');
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

  // HC-4: no retry control anywhere on the map, including here. Recovery is the live access
  // subscription flipping back, not something the user has to press.
  it('offers no retry, refresh, or reload control', () => {
    expect(markup).not.toMatch(/<button/i);
    expect(markup).not.toMatch(/try again|refresh|reload|retry/i);
  });

  it('shows no spinner or progress affordance', () => {
    expect(markup).not.toMatch(/progressbar|aria-busy|spinner|loading/i);
  });
});
