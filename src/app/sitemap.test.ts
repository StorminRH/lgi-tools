import { expect, test } from 'vitest';
import { SITE_URL } from '@/config/site-url';
import { buildSitemapEntries } from '@/composition/sitemap';

const sitemap = buildSitemapEntries({
  codex: [
    { kind: 'sites', key: '3' },
    { kind: 'guides', key: 'rolling-a-c3-static' },
  ],
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

  for (const path of ['/', '/sites', '/legal', '/contact']) {
    expect(entry(path)).not.toHaveProperty('lastModified');
  }

  expect(entry('/changelog')?.lastModified).toBe('2026-07-13');
  expect(entry('/changelog/v3.7')?.lastModified).toBe('2026-07-11');
  expect(entry('/changelog/v3.8')).toBeUndefined();
});

test('buildSitemapEntries lists the Codex index, each kind, and each Codex page in place of the old site pages', () => {
  expect(entry('/codex')).toEqual({ url: `${SITE_URL}/codex`, changeFrequency: 'weekly', priority: 0.8 });
  for (const kind of ['wormholes', 'sites', 'classes', 'guides']) expect(entry(`/codex/${kind}`)).toBeDefined();
  for (const path of ['/codex/sites/3', '/codex/guides/rolling-a-c3-static']) {
    expect(entry(path)).toBeDefined();
    expect(entry(path)).not.toHaveProperty('lastModified');
  }
  expect(entry('/sites/3')).toBeUndefined();
});
