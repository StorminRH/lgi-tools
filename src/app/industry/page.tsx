import type { Metadata } from 'next';
import Link from 'next/link';
import { cache, Suspense } from 'react';
import { FilterBar, type FilterOption } from '@/components/ui/filter-bar';
import { TypeIcon } from '@/components/ui/type-icon';
import { SITE_URL } from '@/config/site-url';
import {
  getBlueprintCatalog,
  getCatalogCategories,
} from '@/features/industry-planner/catalog-queries';
import {
  CATALOG_CAP,
  filterByMarginBand,
  parseMarginBand,
  parseSortDir,
  parseSortKey,
  sortCatalog,
  type MarginBand,
} from '@/features/industry-planner/catalog-sort';
import { BrowseCascade } from '@/features/industry-planner/components/BrowseCascade';
import { CatalogColumn } from '@/features/industry-planner/components/CatalogColumn';
import type { CatalogRow } from '@/features/industry-planner/browse-types';
import { getBlueprintStructure } from '@/features/industry-planner/queries';

export const metadata: Metadata = {
  title: 'Industry Planner',
  description:
    'Browse Eve Online blueprints by profit margin and walk the production chain in a cascading column catalog — build cost, margin, and price confidence at live Jita rates, before job fees.',
  alternates: { canonical: `${SITE_URL}/industry` },
  openGraph: {
    title: 'Industry Planner — LGI.tools',
    description:
      'Browse blueprints by profit margin and walk the production chain — build cost, margin, and price confidence at live Jita rates.',
    url: `${SITE_URL}/industry`,
    type: 'website',
    images: ['/logo.png'],
  },
};

type IndustrySearchParams = {
  category?: string;
  margin?: string;
  sort?: string;
  dir?: string;
};

// A frigate, a battlecruiser, and a capital — a quick spread of build depth.
// These are the resolver's reference blueprints (REFERENCE_BLUEPRINT_TYPE_IDS).
// Favorites/Recent come later (3.1.4); until then the rail is examples-only.
const EXAMPLE_BLUEPRINT_IDS = [691, 24699, 23758];

async function parseIndustryParams(searchParams: Promise<IndustrySearchParams>) {
  const raw = await searchParams;
  const category = raw.category || undefined;
  const marginBand: MarginBand = parseMarginBand(raw.margin);
  const sortKey = parseSortKey(raw.sort);
  const sortDir = parseSortDir(raw.dir);

  // Threaded through every FilterBar + the sort headers so toggling any one
  // preserves the others (matches /sites). The cascade open path is NOT here —
  // it rides ?browse= via useCascadePath, off the server-render path.
  const currentParams: Record<string, string | undefined> = {
    category,
    margin: marginBand !== 'all' ? marginBand : undefined,
    sort: sortKey ?? undefined,
    dir: sortKey ? sortDir : undefined,
  };

  return { category, marginBand, sortKey, sortDir, currentParams };
}

// Per-request memo so the summary line and the catalog share ONE catalog read +
// filter pass across their separate Suspense holes. searchParams is read only
// inside this loader (run from the Suspense children), never in the page body —
// the shell stays static. getBlueprintCatalog is a cached, refresh-free read.
const loadCatalog = cache(
  async (searchParams: Promise<IndustrySearchParams>): Promise<CatalogRow[]> => {
    const { category, marginBand } = await parseIndustryParams(searchParams);
    const all = await getBlueprintCatalog();
    const byCategory = category ? all.filter((r) => r.categoryName === category) : all;
    return filterByMarginBand(byCategory, marginBand);
  },
);

async function CatalogSummary({ searchParams }: { searchParams: Promise<IndustrySearchParams> }) {
  const [rows, { category, marginBand }] = await Promise.all([
    loadCatalog(searchParams),
    parseIndustryParams(searchParams),
  ]);
  const shown = Math.min(rows.length, CATALOG_CAP);
  return (
    <>
      {shown.toLocaleString('en-US')}
      {rows.length > shown ? ` of ${rows.length.toLocaleString('en-US')}` : ''} blueprint
      {rows.length === 1 ? '' : 's'}
      {category ? ` · ${category}` : ''}
      {marginBand === 'profitable' ? ' · profitable' : ''}
    </>
  );
}

const MARGIN_OPTIONS: FilterOption[] = [
  { value: null, label: 'All' },
  { value: 'profitable', label: 'Profitable', tone: 'green' },
];

function BrowseFilterBars({
  category,
  marginBand,
  categories,
  currentParams,
}: {
  category: string | null;
  marginBand: MarginBand;
  categories: string[];
  currentParams: Record<string, string | undefined>;
}) {
  const categoryOptions: FilterOption[] = [
    { value: null, label: 'All' },
    ...categories.map((c): FilterOption => ({ value: c, label: c })),
  ];
  return (
    <div className="w-full max-w-[1100px] flex flex-col gap-2.5 mb-6">
      <FilterBar
        label="Category"
        paramName="category"
        options={categoryOptions}
        activeValue={category}
        basePath="/industry"
        currentParams={currentParams}
      />
      <FilterBar
        label="Margin"
        paramName="margin"
        options={MARGIN_OPTIONS}
        activeValue={marginBand === 'profitable' ? 'profitable' : null}
        basePath="/industry"
        currentParams={currentParams}
      />
    </div>
  );
}

async function LandingRail() {
  const structures = (
    await Promise.all(EXAMPLE_BLUEPRINT_IDS.map((id) => getBlueprintStructure(id)))
  ).filter((s) => s !== null);
  if (structures.length === 0) return null;

  return (
    <div className="w-full max-w-[1100px] flex items-center gap-2.5 flex-wrap mb-5">
      <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-muted w-12 shrink-0">
        Start
      </span>
      {structures.map((s) => (
        <Link
          key={s.blueprintTypeId}
          href={`/industry/${s.blueprintTypeId}`}
          className="inline-flex items-center gap-2 px-2.5 py-1.5 border border-border bg-section rounded-[3px] text-[12px] text-name no-underline transition-colors hover:bg-[rgba(255,255,255,0.018)]"
        >
          <TypeIcon typeId={s.product.typeId} size={22} mono={s.product.name.slice(0, 2)} />
          {s.product.name}
        </Link>
      ))}
    </div>
  );
}

// Interactive chrome — landing rail + filter bars. Depends only on searchParams
// + cached SDE reads (no price read), so it paints near-instantly and never
// waits on the catalog data hole.
async function BrowseChrome({ searchParams }: { searchParams: Promise<IndustrySearchParams> }) {
  const [{ category, marginBand, currentParams }, categories] = await Promise.all([
    parseIndustryParams(searchParams),
    getCatalogCategories(),
  ]);
  return (
    <>
      <LandingRail />
      <BrowseFilterBars
        category={category ?? null}
        marginBand={marginBand}
        categories={categories}
        currentParams={currentParams}
      />
    </>
  );
}

async function BrowseData({ searchParams }: { searchParams: Promise<IndustrySearchParams> }) {
  const [rows, { sortKey, sortDir, currentParams }] = await Promise.all([
    loadCatalog(searchParams),
    parseIndustryParams(searchParams),
  ]);
  const top = sortCatalog(rows, sortKey, sortDir).slice(0, CATALOG_CAP);

  return (
    <div className="w-full">
      <BrowseCascade
        catalog={
          <CatalogColumn
            rows={top}
            totalCount={rows.length}
            sortKey={sortKey}
            sortDir={sortDir}
            currentParams={currentParams}
          />
        }
      />
    </div>
  );
}

function BrowseFilterBarsFallback() {
  return (
    <BrowseFilterBars category={null} marginBand="all" categories={[]} currentParams={{}} />
  );
}

function CatalogLoading() {
  return (
    <div className="w-full text-[10px] tracking-[0.12em] uppercase text-muted">
      Loading catalog…
    </div>
  );
}

// Static shell — background, padding, title — prerenders. searchParams is read
// only inside the <Suspense> children, so each request-time region streams into
// its own hole: the title paints immediately, the rail + filters stream once
// the URL is parsed, and the catalog streams once the priced read resolves.
export default function IndustryBrowsePage({
  searchParams,
}: {
  searchParams: Promise<IndustrySearchParams>;
}) {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <header className="w-full max-w-[1100px] mb-6 pb-4 border-b border-border-soft">
        <h1 className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
          Industry Planner
        </h1>
        <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
          <Suspense fallback={<>&nbsp;</>}>
            <CatalogSummary searchParams={searchParams} />
          </Suspense>
        </div>
      </header>

      <Suspense fallback={<BrowseFilterBarsFallback />}>
        <BrowseChrome searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<CatalogLoading />}>
        <BrowseData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
