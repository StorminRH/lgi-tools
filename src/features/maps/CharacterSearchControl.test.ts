import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CharacterSearchControl } from './CharacterSearchControl';

describe('CharacterSearchControl', () => {
  it('renders the transport controller in its idle, dismissible state', () => {
    const markup = renderToStaticMarkup(
      createElement(CharacterSearchControl, {
        selectedPrincipals: [{ ownerType: 'corporation', ownerId: 99 }],
        onSelect: vi.fn(),
      }),
    );

    expect(markup).toContain('data-map-character-search');
    expect(markup).toContain('Search characters');
    expect(markup).toContain('aria-describedby');
    expect(markup).toContain('Search by character name.');
  });
});
