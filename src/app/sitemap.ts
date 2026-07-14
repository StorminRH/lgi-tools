import type { MetadataRoute } from 'next';
import { cacheLife } from 'next/cache';
import { SITE_URL } from '@/config/site-url';
import { toChangelogDocuments } from '@/features/changelog/browser';
import { loadChangelog } from '@/features/changelog/load';
import { loadDevlog } from '@/features/devlog/load';
import { flattenDocuments, introDocument } from '@/features/devlog/parse';
import { getSiteSearchIndex } from '@/features/wormhole-sites/queries';

type SitemapInputs = {
  sites: { id: number }[];
  changelog: { slug: string; updated: string }[];
  devlog: { slug: string; updated: string }[];
  introSlug: string | undefined;
};

export function buildSitemapEntries({
  sites,
  changelog,
  devlog,
  introSlug,
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

  const devlogRoutes: MetadataRoute.Sitemap = devlog.map((d) => ({
    url: d.slug === introSlug ? `${SITE_URL}/devlog` : `${SITE_URL}/devlog/${d.slug}`,
    lastModified: d.updated,
    changeFrequency: 'monthly',
    priority: d.slug === introSlug ? 0.4 : 0.3,
  }));

  return [...staticRoutes, ...siteRoutes, ...changelogRoutes, ...devlogRoutes];
}

// The catalogue and repo content only change on deploy, so the sitemap is
// cached into the prerendered shell and the build ID invalidates it — no
// request-time reads. `use cache` can't sit directly on the route export.
export async function getSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  'use cache';
  cacheLife('max');

  const [sites, changelogMasters, tree] = await Promise.all([
    getSiteSearchIndex(),
    loadChangelog(),
    loadDevlog(),
  ]);
  const changelog = toChangelogDocuments(changelogMasters).flatMap(({ slug, master }) => {
    const updated = master.subVersions[0]?.date;
    return updated ? [{ slug, updated }] : [];
  });

  return buildSitemapEntries({
    sites,
    changelog,
    devlog: flattenDocuments(tree),
    introSlug: introDocument(tree)?.slug,
  });
}

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return getSitemapEntries();
}
