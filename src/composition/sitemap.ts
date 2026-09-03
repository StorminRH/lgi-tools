import type { MetadataRoute } from 'next';
import { cacheLife } from 'next/cache';
import { SITE_URL } from '@/config/site-url';
import { toChangelogDocuments } from '@/features/changelog/browser';
import { loadChangelog } from '@/features/changelog/load';
import { getSiteSearchIndex } from '@/features/wormhole-sites/queries';

export type SitemapInputs = {
  sites: { id: number }[];
  changelog: { slug: string; updated: string }[];
};

export function buildSitemapEntries({
  sites,
  changelog,
}: SitemapInputs): MetadataRoute.Sitemap {
  const latestChangelogDate = changelog[0]?.updated;
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/sites`, changeFrequency: 'weekly', priority: 0.9 },
    {
      url: `${SITE_URL}/changelog`,
      ...(latestChangelogDate ? { lastModified: latestChangelogDate } : {}),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    { url: `${SITE_URL}/legal`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/contact`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  const siteRoutes: MetadataRoute.Sitemap = sites.map((s) => ({
    url: `${SITE_URL}/sites/${s.id}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const changelogRoutes: MetadataRoute.Sitemap = changelog
    .slice(1)
    .map(({ slug, updated }) => ({
      url: `${SITE_URL}/changelog/${slug}`,
      lastModified: updated,
      changeFrequency: 'monthly',
      priority: 0.3,
    }));

  return [...staticRoutes, ...siteRoutes, ...changelogRoutes];
}

export async function getSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  'use cache';
  cacheLife('max');

  const [sites, changelogMasters] = await Promise.all([
    getSiteSearchIndex(),
    loadChangelog(),
  ]);
  const changelog = toChangelogDocuments(changelogMasters).flatMap(({ slug, master }) => {
    const updated = master.subVersions[0]?.date;
    return updated ? [{ slug, updated }] : [];
  });

  return buildSitemapEntries({
    sites,
    changelog,
  });
}
