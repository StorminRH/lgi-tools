import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';

export function AtlasLandingFallback() {
  return (
    <PageShell mode="workspace">
      <PageHead size="hero" crumb="atlas" title="Atlas" />
    </PageShell>

  );
}
