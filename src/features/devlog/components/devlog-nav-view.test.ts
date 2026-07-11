import { describe, expect, it } from 'vitest';
import type { DevlogNavModel } from '../types';
import { deriveActiveSlug } from './devlog-nav-view';

const model = (over: Partial<DevlogNavModel> = {}): DevlogNavModel => ({
  looseDocuments: [{ slug: 'introduction', title: 'Introduction' }],
  folders: [],
  ...over,
});

describe('deriveActiveSlug', () => {
  it('resolves the slug-less dev-log routes to the intro (first loose) document', () => {
    expect(deriveActiveSlug('/devlog', model())).toBe('introduction');
    expect(deriveActiveSlug('/devlog/', model())).toBe('introduction');
  });

  it('resolves a document route to its slug (with or without a trailing slash)', () => {
    expect(deriveActiveSlug('/devlog/vercel', model())).toBe('vercel');
    expect(deriveActiveSlug('/devlog/vercel/', model())).toBe('vercel');
  });

  it('returns null for non-dev-log paths and deeper nesting', () => {
    expect(deriveActiveSlug('/skills', model())).toBeNull();
    expect(deriveActiveSlug('/devlog/a/b', model())).toBeNull();
    expect(deriveActiveSlug('/', model())).toBeNull();
  });

  it('returns null on the intro route when there are no loose documents', () => {
    expect(deriveActiveSlug('/devlog', model({ looseDocuments: [] }))).toBeNull();
  });
});
