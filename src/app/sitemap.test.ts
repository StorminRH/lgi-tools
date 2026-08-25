import { expect, test } from 'vitest';
import { SITE_URL } from '@/config/site-url';
import { buildSitemapEntries } from '@/composition/sitemap';

const sitemap = buildSitemapEntries({
  sites: [{ id: 1 }, { id: 2 }],
  changelog: [
    { slug: 'v3.8', updated: '2026-07-13' },
    { slug: 'v3.7', updated: '2026-07-11' },
  ],
});

function entry(path: string) {
  return sitemap.find(({ url }) => url === `${SITE_URL}${path}`);
}

test('buildSitemapEntries pins contact uniqueness, omits fabricated dates, and keeps release/document dates', () => {
  expect(sitemap.filter(({ url }) => url === `${SITE_URL}/contact`)).toHaveLength(1);

  for (const path of ['/', '/sites', '/legal', '/contact', '/sites/1', '/sites/2']) {
    expect(entry(path)).not.toHaveProperty('lastModified');
  }

  expect(entry('/changelog')?.lastModified).toBe('2026-07-13');
  expect(entry('/changelog/v3.7')?.lastModified).toBe('2026-07-11');
  expect(entry('/changelog/v3.8')).toBeUndefined();
});
