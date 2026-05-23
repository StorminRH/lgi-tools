import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, type FilterOption } from '@/components/ui/filter-bar';
import { UrlSync } from '@/components/ui/url-sync';
import { getPricesFreshness } from '@/data/market-prices/cache';
import { db } from '@/db';
import { RefreshFooter } from '@/features/wormhole-sites/components/RefreshFooter';
import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';
import {
  CLASS_TONE,
  SITE_TYPE_LABEL,
  SITE_TYPE_TONE,
} from '@/features/wormhole-sites/components/wormhole-styles';
import { overlayLivePrices } from '@/features/wormhole-sites/live-prices';
import { listSiteDetails } from '@/features/wormhole-sites/queries';
import { SITE_TYPES, WORMHOLE_CLASSES } from '@/features/wormhole-sites/schema';
import type { SiteDetail, SiteType, WormholeClass } from '@/features/wormhole-sites/types';

const SECTION_ORDER: SiteType[] = ['combat', 'ore', 'gas', 'relic', 'data'];

const TYPE_OPTIONS: FilterOption[] = [
  { value: null, label: 'All' },
  ...SITE_TYPES.map(
    (t): FilterOption => ({ value: t, label: SITE_TYPE_LABEL[t], tone: SITE_TYPE_TONE[t] }),
  ),
];

const CLASS_OPTIONS: FilterOption[] = [
  { value: null, label: 'All' },
  ...WORMHOLE_CLASSES.map(
    (c): FilterOption => ({ value: c, label: c, tone: CLASS_TONE[c] }),
  ),
];

function groupBySection(sites: SiteDetail[]): Record<SiteType, SiteDetail[]> {
  const groups: Record<SiteType, SiteDetail[]> = {
    combat: [], ore: [], gas: [], relic: [], data: [],
  };
  for (const s of sites) groups[s.siteType].push(s);
  return groups;
}

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; class?: string }>;
}) {
  const raw = await searchParams;

  const type: SiteType | undefined =
    raw.type && (SITE_TYPES as readonly string[]).includes(raw.type)
      ? (raw.type as SiteType)
      : undefined;

  const wormholeClass: WormholeClass | undefined =
    raw.class && (WORMHOLE_CLASSES as readonly string[]).includes(raw.class)
      ? (raw.class as WormholeClass)
      : undefined;

  const rawSites = await listSiteDetails({ type, wormholeClass });
  const sites = await overlayLivePrices(rawSites);
  const { lastUpdatedAt } = await getPricesFreshness(db);
  const groups = groupBySection(sites);
  const currentParams = { type, class: wormholeClass };

  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <header className="w-full max-w-[1100px] mb-6 pb-4 border-b border-border-soft">
        <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
          LGI.tools — Wormhole Sites
        </div>
        <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
          {sites.length} site{sites.length === 1 ? '' : 's'}
          {type ? ` · ${SITE_TYPE_LABEL[type]}` : ''}
          {wormholeClass ? ` · ${wormholeClass}` : ''}
        </div>
      </header>

      <div className="w-full max-w-[1100px] flex flex-col gap-2.5 mb-8">
        <FilterBar
          label="Type"
          paramName="type"
          options={TYPE_OPTIONS}
          activeValue={type ?? null}
          basePath="/sites"
          currentParams={currentParams}
        />
        <FilterBar
          label="Class"
          paramName="class"
          options={CLASS_OPTIONS}
          activeValue={wormholeClass ?? null}
          basePath="/sites"
          currentParams={currentParams}
        />
      </div>

      {sites.length === 0 ? (
        <div className="w-full max-w-[1100px]">
          <EmptyState>No sites match this filter combination.</EmptyState>
        </div>
      ) : (
        SECTION_ORDER.map((sectionType, i) => {
          const sectionSites = groups[sectionType];
          if (sectionSites.length === 0) return null;
          return (
            <section key={sectionType} className="w-full max-w-[1100px]">
              <div className={`w-full flex items-center gap-3.5 ${i === 0 ? 'mt-0' : 'mt-12'} mb-5`}>
                <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-muted whitespace-nowrap">
                  {SITE_TYPE_LABEL[sectionType]} Sites
                </span>
                <div className="flex-1 h-px bg-border-soft" />
              </div>
              <div
                className="grid items-start gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}
              >
                {sectionSites.map((site) => (
                  <UrlSync key={site.id} basePath="/sites" entityId={site.id}>
                    <SiteCard site={site} />
                  </UrlSync>
                ))}
              </div>
            </section>
          );
        })
      )}

      <RefreshFooter initialLastUpdatedAt={lastUpdatedAt?.toISOString() ?? null} />
    </div>
  );
}
