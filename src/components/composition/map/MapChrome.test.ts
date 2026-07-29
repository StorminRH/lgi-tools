import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MapChrome } from './MapChrome';

vi.mock('@/components/composition/account/AccountMenu', () => ({
  AccountMenu: () => createElement('div', { 'data-account-menu': '' }),
}));

vi.mock('@/components/composition/FeedbackButton', () => ({
  FeedbackButton: ({ compact }: { compact?: boolean }) =>
    createElement('div', { 'data-feedback-compact': String(compact) }),
}));

vi.mock('./MapMenu', () => ({
  MapMenu: () => createElement('div', { 'data-map-menu': '' }),
}));

describe('MapChrome', () => {
  it('composes three floating positions while leaving the search slot empty', () => {
    const markup = renderToStaticMarkup(
      createElement(MapChrome, {
        session: {
          characterId: 1,
          name: 'Mapper',
          portraitUrl: '/portrait.png',
          role: 'ADMIN',
        },
      }),
    );

    expect(markup).toContain('data-map-menu');
    expect(markup).toContain('data-account-menu');
    expect(markup).toContain('data-feedback-compact="true"');
    expect(markup).toMatch(
      /<div data-map-search-slot="true" aria-hidden="true"[^>]*><\/div>/,
    );
  });

  it('omits only the account control when an authorized user has no active character', () => {
    const markup = renderToStaticMarkup(
      createElement(MapChrome, { session: null }),
    );

    expect(markup).toContain('data-map-menu');
    expect(markup).toContain('data-map-search-slot');
    expect(markup).toContain('data-feedback-compact="true"');
    expect(markup).not.toContain('data-account-menu');
  });
});
