import { parseRange, rangeFor } from '@/composition/admin-period';
import { getLatestReportDate } from '@/data/gsc/queries';
import { isGscConfigured } from '@/data/gsc/constants';
import { AdminPageFrame, AdminSlot } from '../AdminFrame';
import { loadSection, SECTION_LOAD_FAILED } from '../load-section';
import { SectionUnavailable } from '../SectionUnavailable';
import type { RangeSearchParams } from '../RangeControl';
import { searchPeriods } from './search-period';
import { IndexCoverageCard } from './IndexCoverageCard';
import { PerformanceCard, SearchNotConnected, SitemapsCard, TermCards } from './SearchCards';

async function SearchContent({ searchParams }: { searchParams: RangeSearchParams }) {
  const rangeKey = parseRange((await searchParams).range);
  if (!isGscConfigured()) return <SearchNotConnected />;
  const latestDay = await loadSection('search-report-date', getLatestReportDate);
  if (latestDay === SECTION_LOAD_FAILED) return <SectionUnavailable label="Search" />;
  const { range, previous } = searchPeriods(rangeKey, latestDay ?? new Date().toISOString().slice(0, 10));
  return (
    <>
      <AdminSlot label="Performance" rows={4} reveal={1}>
        <PerformanceCard range={range} previous={previous} />
      </AdminSlot>
      <AdminSlot label="Top queries" rows={8} reveal={2}>
        <TermCards range={range} />
      </AdminSlot>
      <AdminSlot label="Index coverage" rows={6} reveal={3}>
        <IndexCoverageCard range={rangeFor(rangeKey)} />
      </AdminSlot>
      <AdminSlot label="Sitemaps" rows={2} reveal={4}>
        <SitemapsCard />
      </AdminSlot>
    </>
  );
}

export default function AdminSearchPage({ searchParams }: { searchParams: RangeSearchParams }) {
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
