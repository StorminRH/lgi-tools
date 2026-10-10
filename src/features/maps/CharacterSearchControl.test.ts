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
    // The visible "Add character" label names the search input, so speech input finds it.
    const inputId = /<label for="([^"]+)"[^>]*>Add character<\/label>/.exec(markup)?.[1];
    const input = /<input[^>]*role="combobox"[^>]*>/.exec(markup)?.[0] ?? '';
    const hintId = /<span id="([^"]+)"[^>]*>Search by character name\.<\/span>/.exec(markup)?.[1];
    expect(inputId).toBeTruthy();
    expect(input).toContain(` id="${inputId}"`);
    expect(input).not.toContain('aria-label=');
    expect(input).toContain(` aria-describedby="${hintId}"`);
  });
});
