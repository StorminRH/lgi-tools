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
  expect(deriveActiveContentSlug('/devlog', '/devlog', 'introduction')).toBe('introduction');
  expect(deriveActiveContentSlug('/devlog/', '/devlog/', 'introduction')).toBe('introduction');
  expect(deriveActiveContentSlug('/devlog/vercel', '/devlog', 'introduction')).toBe('vercel');
  expect(deriveActiveContentSlug('/devlog/vercel/', '/devlog', 'introduction')).toBe('vercel');

  expect(deriveActiveContentSlug('/skills', '/devlog', 'introduction')).toBeNull();
  expect(deriveActiveContentSlug('/devlog/a/b', '/devlog', 'introduction')).toBeNull();
  expect(deriveActiveContentSlug('/', '/devlog', 'introduction')).toBeNull();

  expect(deriveActiveContentSlug('/docs.v2/item', '/docs.v2', 'intro')).toBe('item');
  expect(deriveActiveContentSlug('/docsXv2/item', '/docs.v2', 'intro')).toBeNull();

  expect(contentBrowserHref('/devlog/', 'introduction', 'introduction')).toBe('/devlog');
  expect(contentBrowserHref('/devlog', 'vercel', 'introduction')).toBe('/devlog/vercel');
});
