import { expect, test } from 'vitest';
import type { ContentNavModel } from './content-browser-view';
import {
  contentBrowserHref,
  deriveActiveContentSlug,
  landingContentSlug,
  titleForSlug,
} from './content-browser-view';

const flatModel: ContentNavModel = {
  items: [
    { slug: 'intro', title: 'Introduction' },
    { slug: 'vercel', title: 'Vercel' },
  ],
};

test('landingContentSlug and titleForSlug resolve flat and empty navigation', () => {
  expect(landingContentSlug({ items: [{ slug: 'newest', title: 'Newest' }] })).toBe('newest');
  expect(landingContentSlug({ items: [] })).toBeNull();

  expect(titleForSlug(flatModel, 'intro')).toBe('Introduction');
  expect(titleForSlug(flatModel, 'vercel')).toBe('Vercel');
  expect(titleForSlug(flatModel, 'missing')).toBeNull();
  expect(titleForSlug(flatModel, null)).toBeNull();
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
