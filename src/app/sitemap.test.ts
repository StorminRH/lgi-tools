import { describe, expect, it } from 'vitest';
import { SITE_URL } from '@/config/site-url';
import { buildSitemapEntries } from '@/composition/sitemap';

const sitemap = buildSitemapEntries({
  sites: [{ id: 1 }, { id: 2 }],
  changelog: [
    { slug: 'v3.8', updated: '2026-07-13' },
    { slug: 'v3.7', updated: '2026-07-11' },
  ],
  devlog: [
    { slug: 'introduction', updated: '2026-06-30' },
    { slug: 'neon', updated: '2026-07-12' },
  ],
  introSlug: 'introduction',
});

function entry(path: string) {
  return sitemap.find(({ url }) => url === `${SITE_URL}${path}`);
}

describe('buildSitemapEntries', () => {
  it('includes contact exactly once', () => {
    expect(sitemap.filter(({ url }) => url === `${SITE_URL}/contact`)).toHaveLength(1);
  });

  it('omits fabricated dates from static and catalogue URLs', () => {
    for (const path of ['/', '/sites', '/legal', '/contact', '/sites/1', '/sites/2']) {
      expect(entry(path)).not.toHaveProperty('lastModified');
    }
  });

  it('uses release dates for the changelog family', () => {
    expect(entry('/changelog')?.lastModified).toBe('2026-07-13');
    expect(entry('/changelog/v3.7')?.lastModified).toBe('2026-07-11');
    expect(entry('/changelog/v3.8')).toBeUndefined();
  });

  it('uses distinct committed document dates for devlog URLs', () => {
    expect(entry('/devlog')?.lastModified).toBe('2026-06-30');
    expect(entry('/devlog/neon')?.lastModified).toBe('2026-07-12');
  });
});
