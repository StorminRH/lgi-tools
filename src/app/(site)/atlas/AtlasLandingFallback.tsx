import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';

/**
 * Site-shaped Atlas shell shown while the administrator gate resolves, matching
 * Industry and Sites so soft navigation never paints the development wall.
 */
export function AtlasLandingFallback() {
  return (
    <PageShell mode="workspace">
      <PageHead size="hero" crumb="atlas" title="Atlas" />
    </PageShell>
  );
}
