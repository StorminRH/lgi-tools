import { NotFoundContent } from '@/components/composition/NotFoundContent';
import { SiteFrame } from '@/components/composition/SiteFrame';

/**
 * Framework-load-bearing: Next 16's not-found file convention honours a
 * `metadata` export to set the 404 page's head tags (the not-found.mdx docs),
 * the same metadata API page/layout use — so this title is consumed by Next,
 * not by app code. fallow sees no app-side importer, so the suppression stays.
 */
// fallow-ignore-next-line unused-export
export const metadata = {
  title: 'Not found',
};

/**
 * Unmatched-URL 404. Composes site chrome itself because this file cannot live
 * inside the (site) group — Next routes every unmatched URL to the root file.
 */
export default function NotFound() {
  return (
    <SiteFrame>
      <NotFoundContent />
    </SiteFrame>
  );
}
