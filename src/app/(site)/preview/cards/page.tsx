import type { Metadata } from 'next';
import { PageTitle } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';
import { SITE_TYPE_LABEL } from '@/features/wormhole-sites/components/wormhole-styles';
import { MOCK_SITES } from '@/features/wormhole-sites/mock-data';
import type { SiteDetail, SiteType } from '@/features/wormhole-sites/types';

export const metadata: Metadata = { robots: { index: false } };

const SECTION_ORDER: SiteType[] = ['combat', 'ore', 'gas', 'relic', 'data'];
const SECTION_REVEAL = ['reveal-1', 'reveal-2', 'reveal-3', 'reveal-4', 'reveal-5'] as const;

function bySection(sites: SiteDetail[]): Record<SiteType, SiteDetail[]> {
  const groups: Record<SiteType, SiteDetail[]> = {
    combat: [], ore: [], gas: [], relic: [], data: [],
  };
  for (const s of sites) groups[s.siteType].push(s);
  return groups;
}

export default function PreviewCardsPage() {
  const groups = bySection(MOCK_SITES);

  return (
    <PageShell mode="detail">
      <div className="flex flex-col items-center pb-20 gap-0">
        <header className="w-full max-w-[1100px] mb-10 pb-4 border-b border-border-soft">
          <PageTitle size="compact" className="mb-1">
            Site Card Reference
          </PageTitle>
          <div className="font-data text-label text-muted tracking-label uppercase">
            All wormhole site types · A1 blue-gray theme · Mock data
          </div>
        </header>

      {SECTION_ORDER.map((type, i) => {
        const sites = groups[type];
        if (sites.length === 0) return null;
        return (
          <section key={type} className={`reveal ${SECTION_REVEAL[i] ?? ''} w-full max-w-[1100px]`}>
            <div className={`w-full flex items-center gap-3.5 ${i === 0 ? 'mt-0' : 'mt-12'} mb-5`}>
              <span className="font-data text-label font-semibold tracking-eyebrow uppercase text-muted whitespace-nowrap">
                {SITE_TYPE_LABEL[type]} Sites
              </span>
              <div className="flex-1 h-px bg-border-soft" />
            </div>
            <div className="grid items-start gap-4 grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
              {sites.map((site) => (
                <SiteCard key={site.id} site={site} />
              ))}
            </div>
          </section>
        );
      })}
      </div>
    </PageShell>
  );
}
