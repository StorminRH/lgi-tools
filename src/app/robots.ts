import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/site-url';

/**
 * Allow all crawlers across user-facing routes; explicitly block the admin
 * dashboard and API surface from indexing. The sitemap pointer uses the
 * canonical SITE_URL so search engines fetch the production sitemap rather
 * than whichever preview deploy they happened to land on.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
