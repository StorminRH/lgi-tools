import { DistributionBars } from '@/components/ui/distribution-bars';
import { EmptyState } from '@/components/ui/empty-state';
import { parseRange, rangeFor } from '@/composition/admin-period';
import { isGscConfigured } from '@/data/gsc/constants';
import { getSitemapStatus } from '@/data/gsc/queries';
import { formatCount } from '@/lib/format/number';
import { AdminPageFrame } from '../AdminFrame';
import { AdminSection } from '../AdminSection';
import type { RangeSearchParams } from '../RangeControl';
import { IndexCoverageBody, loadIndexCoverage } from './IndexCoverageCard';
import {
  loadSearchPerformance,
  loadSearchTerms,
  PerformanceBody,
  SearchNotConnected,
  SitemapList,
} from './SearchCards';
import { gscTermBars } from './search-view';

const TERM_LISTS = [
  {
    title: 'Top queries',
    name: 'top-queries',
    kind: 'queries',
    empty: 'No search queries in this range.',
    ariaLabel: 'Top search queries by clicks',
  },
  {
    title: 'Top pages in search',
    name: 'top-search-pages',
    kind: 'pages',
    empty: 'No search-landing pages in this range.',
    ariaLabel: 'Top pages in search by clicks',
  },
] as const;

// Index coverage and Sitemaps need no reporting day, so they start with the
// page rather than behind the cards that count back from it.
async function SearchContent({ searchParams }: { searchParams: RangeSearchParams }) {
  const rangeKey = parseRange((await searchParams).range);
  const coverageRange = rangeFor(rangeKey);
  return (
    <>
      <AdminSection
        title="Performance"
        name="search-performance"
        rows={4}
        reveal={1}
        load={() => loadSearchPerformance(rangeKey)}
      >
        {(performance) => <PerformanceBody performance={performance} />}
      </AdminSection>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {TERM_LISTS.map((list) => (
          <AdminSection
            key={list.name}
            title={list.title}
            name={list.name}
            rows={8}
            reveal={2}
            load={() => loadSearchTerms(list.kind, rangeKey)}
          >
            {({ terms, clicks }) =>
              terms.length === 0 ? (
                <EmptyState>{list.empty}</EmptyState>
              ) : (
                <DistributionBars
                  rows={gscTermBars(terms)}
                  total={clicks}
                  sort="none"
                  formatCount={(count) => formatCount(count, 'clk', 'clk')}
                  ariaLabel={list.ariaLabel}
                />
              )
            }
          </AdminSection>
        ))}
      </div>
      <AdminSection
        title="Index coverage"
        name="index-coverage"
        rows={6}
        reveal={3}
        load={() => loadIndexCoverage(coverageRange)}
      >
        {(coverage) => <IndexCoverageBody view={coverage} />}
      </AdminSection>
      <AdminSection title="Sitemaps" name="sitemaps" rows={2} reveal={4} load={getSitemapStatus}>
        {(sitemaps) => <SitemapList sitemaps={sitemaps} />}
      </AdminSection>
    </>
  );
}

export default function AdminSearchPage({ searchParams }: { searchParams: RangeSearchParams }) {
  // Without Search Console there is nothing for a range to filter.
  if (!isGscConfigured()) {
    return (
      <AdminPageFrame title="Search" fallbackLabel="Search Console">
        <SearchNotConnected />
      </AdminPageFrame>
    );
  }
  return (
    <AdminPageFrame
      title="Search"
      rangeBasePath="/admin/search"
      fallbackLabel="Performance"
    >
      <SearchContent searchParams={searchParams} />
    </AdminPageFrame>
  );
}
