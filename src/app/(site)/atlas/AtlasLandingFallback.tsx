import { PageShell } from '@/components/ui/page-shell';

// Atlas has no visible page head: the nav names the page. The fallback keeps
// the shell and the hidden heading so the resolved views slot in without a jump.
export function AtlasLandingFallback() {
  return (
    <PageShell mode="workspace">
      <h1 className="sr-only">Atlas</h1>
    </PageShell>
  );
}
