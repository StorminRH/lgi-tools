import { PageShell } from '@/components/ui/page-shell';

export function AtlasLandingFallback() {
  return (
    <PageShell mode="workspace">
      <h1 className="sr-only">Atlas</h1>
    </PageShell>
  );
}
