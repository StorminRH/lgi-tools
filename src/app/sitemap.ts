import type { MetadataRoute } from 'next';
import { getSitemapEntries } from '@/composition/sitemap';

/**
 * Serves the cached canonical sitemap assembled by the composition owner.
 */
export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return getSitemapEntries();
}
