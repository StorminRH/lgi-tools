import { expect, test } from 'vitest';
import type { ContentNavModel } from './content-browser-view';
import {
  contentBrowserHref,
  deriveActiveContentSlug,
  landingContentSlug,
  titleForSlug,
} from './content-browser-view';

const mixedModel: ContentNavModel = {
  items: [{ slug: 'intro', title: 'Introduction' }],
  groups: [
    {
      slug: 'platform',
      title: 'Platform',
      items: [{ slug: 'vercel', title: 'Vercel' }],
    },
  ],
};

test('landingContentSlug and titleForSlug resolve flat, grouped, and empty navigation', () => {
  expect(landingContentSlug({ items: [{ slug: 'newest', title: 'Newest' }], groups: [] })).toBe(
    'newest',
  );
  expect(
    landingContentSlug({
      items: [],
      groups: [
        {
          slug: 'platform',
          title: 'Platform',
          items: [{ slug: 'vercel', title: 'Vercel' }],
        },
      ],
    }),
  ).toBe('vercel');
  expect(landingContentSlug({ items: [], groups: [] })).toBeNull();

  expect(titleForSlug(mixedModel, 'intro')).toBe('Introduction');
  expect(titleForSlug(mixedModel, 'vercel')).toBe('Vercel');
  expect(titleForSlug(mixedModel, 'missing')).toBeNull();
  expect(titleForSlug(mixedModel, null)).toBeNull();
});

test('deriveActiveContentSlug and contentBrowserHref keep landing and child routes honest', () => {
  expect(deriveActiveContentSlug('/changelog', '/changelog', 'v4.0')).toBe('v4.0');
  expect(deriveActiveContentSlug('/changelog/', '/changelog/', 'v4.0')).toBe('v4.0');
  expect(deriveActiveContentSlug('/changelog/v3.8', '/changelog', 'v4.0')).toBe('v3.8');
  expect(deriveActiveContentSlug('/changelog/v3.8/', '/changelog', 'v4.0')).toBe('v3.8');

  expect(deriveActiveContentSlug('/skills', '/changelog', 'v4.0')).toBeNull();
  expect(deriveActiveContentSlug('/changelog/a/b', '/changelog', 'v4.0')).toBeNull();
  expect(deriveActiveContentSlug('/', '/changelog', 'v4.0')).toBeNull();

  expect(deriveActiveContentSlug('/docs.v2/item', '/docs.v2', 'intro')).toBe('item');
  expect(deriveActiveContentSlug('/docsXv2/item', '/docs.v2', 'intro')).toBeNull();

  expect(contentBrowserHref('/changelog/', 'v4.0', 'v4.0')).toBe('/changelog');
  expect(contentBrowserHref('/changelog', 'v3.8', 'v4.0')).toBe('/changelog/v3.8');
});
