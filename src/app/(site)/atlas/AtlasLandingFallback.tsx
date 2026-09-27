import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';

// The resolved guest and catalogue heads take this head's place without an
// entrance of their own (reveal={false}), so the title never blinks.
export function AtlasLandingFallback() {
  return (
    <PageShell mode="workspace">
      <PageHead size="hero" crumb="atlas" title="Atlas" />
    </PageShell>
  );
}
