import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';
import { SITE_TYPE_LABEL } from '@/features/wormhole-sites/components/wormhole-styles';
import { MOCK_SITES } from '@/features/wormhole-sites/mock-data';
import type { SiteDetail, SiteType } from '@/features/wormhole-sites/types';

const SECTION_ORDER: SiteType[] = ['combat', 'ore', 'gas', 'relic', 'data'];

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
    <div className="flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <header className="w-full max-w-[1100px] mb-10 pb-4 border-b border-[#1a2535]">
        <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
          Site Card Reference
        </div>
        <div className="text-[10px] text-[#2a4050] tracking-[0.12em] uppercase">
          All wormhole site types · A1 blue-gray theme · Mock data
        </div>
      </header>

      {SECTION_ORDER.map((type, i) => {
        const sites = groups[type];
        if (sites.length === 0) return null;
        return (
          <section key={type} className="w-full max-w-[1100px]">
            <div className={`w-full flex items-center gap-3.5 ${i === 0 ? 'mt-0' : 'mt-12'} mb-5`}>
              <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-[#2a4050] whitespace-nowrap">
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
  );
}
