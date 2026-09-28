import { parseRange, rangeFor } from '@/composition/admin-period';
import { isGscConfigured } from '@/data/gsc/constants';
import { AdminPageFrame, AdminSlot } from '../AdminFrame';
import type { RangeSearchParams } from '../RangeControl';
import { IndexCoverageCard } from './IndexCoverageCard';
import { PerformanceCard, SearchNotConnected, SitemapsCard, TermCards } from './SearchCards';

async function SearchContent({ searchParams }: { searchParams: RangeSearchParams }) {
  const rangeKey = parseRange((await searchParams).range);
  if (!isGscConfigured()) return <SearchNotConnected />;
  const range = rangeFor(rangeKey);
  return (
    <>
      <AdminSlot label="Performance" rows={4} reveal={1}>
        <PerformanceCard rangeKey={rangeKey} range={range} />
      </AdminSlot>
      <AdminSlot label="Top queries" rows={8} reveal={2}>
        <TermCards range={range} />
      </AdminSlot>
      <AdminSlot label="Index coverage" rows={6} reveal={3}>
        <IndexCoverageCard range={range} />
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
      description="Google Search Console: clicks, what people searched, and which pages Google has indexed."
      rangeBasePath="/admin/search"
      fallbackLabel="Performance"
    >
      <SearchContent searchParams={searchParams} />
    </AdminPageFrame>
  );
}
