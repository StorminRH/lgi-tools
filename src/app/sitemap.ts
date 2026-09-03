import type { MetadataRoute } from 'next';
import { getSitemapEntries } from '@/composition/sitemap';

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return getSitemapEntries();
}
