import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/site-url';
import { getSiteSearchIndex } from '@/features/wormhole-sites/queries';

// Rendered on each request, not at build time. Next.js otherwise tries
// to statically generate metadata routes (sitemap.xml, robots.txt) during
// `next build`, which fails locally without DATABASE_URL — same constraint
// that drove the lazy DB client. Catalogue size is 69 rows; on-demand
// rendering is the right call regardless.
export const dynamic = 'force-dynamic';

// Sitemap is regenerated on each request. The catalogue read is 69 rows
// with no joins via getSiteSearchIndex(); cheap enough that we don't need
// a separate cache layer. Google Search Console re-crawls weekly so the
// on-demand cost is negligible.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
