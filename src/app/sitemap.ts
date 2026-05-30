import type { MetadataRoute } from 'next';
import { cacheLife } from 'next/cache';
import { SITE_URL } from '@/config/site-url';
import { getSiteSearchIndex } from '@/features/wormhole-sites/queries';

// The catalogue (69 rows) only changes on deploy, so the sitemap is cached into
// the prerendered shell and the build ID invalidates it on each deploy — no
// per-request work. `use cache` can't sit directly on the route export, so the
// body lives in this helper; `new Date()` is captured inside the cache scope
// (the build/revalidation time), which `use cache` permits.
async function buildSitemap(): Promise<MetadataRoute.Sitemap> {
  'use cache';
  cacheLife('max');
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/sites`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/changelog`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/legal`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];

  const sites = await getSiteSearchIndex();
  const siteRoutes: MetadataRoute.Sitemap = sites.map((s) => ({
    url: `${SITE_URL}/sites/${s.id}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticRoutes, ...siteRoutes];
}

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap();
}
