import { NotFoundContent } from '@/components/composition/NotFoundContent';

/**
 * Framework-load-bearing: Next honours a segment not-found `metadata` export
 * the same way as the root file. Keep the title identical so segment
 * `notFound()` callers do not regress the tab title after the route-group split.
 */
// fallow-ignore-next-line unused-export
export const metadata = {
  title: 'Not found',
};

/**
 * Segment not-found for (site) routes that call notFound(). Inherits chrome
 * from the group layout so exactly one header landmark renders.
 */
export default function SiteNotFound() {
  return <NotFoundContent />;
}
