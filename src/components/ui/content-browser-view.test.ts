import { describe, expect, it } from 'vitest';
import type { ContentNavModel } from './content-browser-view';
import {
  contentBrowserHref,
  deriveActiveContentSlug,
  landingContentSlug,
} from './content-browser-view';

describe('content browser navigation', () => {
  it('uses the first flat item as the landing document', () => {
    const model: ContentNavModel = {
      items: [{ slug: 'newest', title: 'Newest' }],
      groups: [],
    };
    expect(landingContentSlug(model)).toBe('newest');
  });

  it('falls back to the first grouped item when the flat list is empty', () => {
    const model: ContentNavModel = {
      items: [],
      groups: [
        {
          slug: 'platform',
          title: 'Platform',
          items: [{ slug: 'vercel', title: 'Vercel' }],
        },
      ],
    };
    expect(landingContentSlug(model)).toBe('vercel');
  });

  it('returns null when the model has no documents', () => {
    expect(landingContentSlug({ items: [], groups: [] })).toBeNull();
  });

  it('resolves base routes and their trailing slash to the landing document', () => {
    expect(deriveActiveContentSlug('/devlog', '/devlog', 'introduction')).toBe('introduction');
    expect(deriveActiveContentSlug('/devlog/', '/devlog/', 'introduction')).toBe('introduction');
  });

  it('resolves one child segment with or without a trailing slash', () => {
    expect(deriveActiveContentSlug('/devlog/vercel', '/devlog', 'introduction')).toBe('vercel');
    expect(deriveActiveContentSlug('/devlog/vercel/', '/devlog', 'introduction')).toBe('vercel');
  });

  it('rejects unrelated and deeper paths', () => {
    expect(deriveActiveContentSlug('/skills', '/devlog', 'introduction')).toBeNull();
    expect(deriveActiveContentSlug('/devlog/a/b', '/devlog', 'introduction')).toBeNull();
    expect(deriveActiveContentSlug('/', '/devlog', 'introduction')).toBeNull();
  });

  it('treats base-path punctuation literally without regex matching', () => {
    expect(deriveActiveContentSlug('/docs.v2/item', '/docs.v2', 'intro')).toBe('item');
    expect(deriveActiveContentSlug('/docsXv2/item', '/docs.v2', 'intro')).toBeNull();
  });

  it('builds the landing href at the base path and other hrefs below it', () => {
    expect(contentBrowserHref('/devlog/', 'introduction', 'introduction')).toBe('/devlog');
    expect(contentBrowserHref('/devlog', 'vercel', 'introduction')).toBe('/devlog/vercel');
  });
});
