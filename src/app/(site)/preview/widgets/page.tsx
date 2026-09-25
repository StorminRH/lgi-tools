import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { getSiteSearchIndex } from '@/features/wormhole-sites/queries';
import { SiteCardWidget } from '@/features/wormhole-sites/widget';
import { UniverseAssetsProof } from './universe-assets-proof';

export const metadata: Metadata = {
  title: 'Widget Reference — LGI.tools',
  robots: { index: false },
};

export default async function WidgetReferencePage() {
  const [site] = await getSiteSearchIndex();
  if (site === undefined) notFound();

  return (
    <PageShell mode="workspace">
      <PageHead
        size="compact"
        crumb="preview / widgets"
        title="Feature widget reference"
        subtitle="The sites card filling two host-owned window sizes"
      />
      <UniverseAssetsProof />
      <div className="reveal reveal-2 flex flex-wrap items-start gap-8 pb-region">
        <section>
          <h2 className="mb-3 font-data text-label tracking-label uppercase text-muted">
            Standard · 360 × 480
          </h2>
          <div className="h-[480px] w-[360px] max-w-full overflow-hidden border border-border glass-surface glass-lit rounded-card shadow-card-edge p-2">
            <SiteCardWidget siteId={site.id} />
          </div>
        </section>
        <section>
          <h2 className="mb-3 font-data text-label tracking-label uppercase text-muted">
            Compact · 320 × 300
          </h2>
          <div className="h-[300px] w-[320px] max-w-full overflow-hidden border border-border glass-surface glass-lit rounded-card shadow-card-edge p-2">
            <SiteCardWidget siteId={site.id} />
          </div>
        </section>
      </div>
    </PageShell>
  );
}
