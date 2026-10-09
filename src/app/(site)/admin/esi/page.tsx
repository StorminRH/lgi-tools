import { parseRange, rangeFor } from '@/composition/admin-period';
import { AdminPageFrame } from '../AdminFrame';
import { AdminSection } from '../AdminSection';
import { CardLink } from '../CardLink';
import { LevelRows } from '../LevelRows';
import type { RangeSearchParams } from '../RangeControl';
import {
  BudgetGauge,
  EndpointBars,
  loadBudget,
  loadBusiestEndpoints,
  loadOnDemandMetrics,
  loadPressureLines,
  loadPriceSources,
  MetricList,
  PriceSourceCharts,
} from './EsiCards';

async function EsiContent({ searchParams }: { searchParams: RangeSearchParams }) {
  const range = rangeFor(parseRange((await searchParams).range));
  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminSection
          title="Error budget"
          name="budget"
          rows={4}
          reveal={1}
          slotClassName="h-full"
          className="h-full"
          load={loadBudget}
        >
          {(budget) => <BudgetGauge budget={budget} />}
        </AdminSection>
        <AdminSection
          title="Rate-limit pressure"
          name="pressure"
          rows={5}
          reveal={2}
          slotClassName="h-full"
          className="h-full"
          hint={<CardLink href="/admin/queue">Queue</CardLink>}
          load={() => loadPressureLines(range)}
        >
          {(lines) => <LevelRows lines={lines} />}
        </AdminSection>
      </div>
      <AdminSection
        title="Scheduled price sources"
        name="price-sources"
        rows={4}
        reveal={3}
        load={() => loadPriceSources(range)}
      >
        {(sources) => <PriceSourceCharts sources={sources} />}
      </AdminSection>
      {/* Natural heights: the endpoint list is often much shorter than the figures. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <AdminSection
          title="On-demand prices & history"
          name="on-demand"
          rows={6}
          reveal={4}
          load={() => loadOnDemandMetrics(range)}
        >
          {(rows) => <MetricList rows={rows} />}
        </AdminSection>
        <AdminSection
          title="Busiest owned-data endpoints"
          name="endpoints"
          rows={6}
          reveal={4}
          load={() => loadBusiestEndpoints(range)}
        >
          {(rows) => <EndpointBars rows={rows} />}
        </AdminSection>
      </div>
    </>
  );
}

export default function AdminEsiPage({ searchParams }: { searchParams: RangeSearchParams }) {
  return (
    <AdminPageFrame
      title="ESI & rate limits"
      rangeBasePath="/admin/esi"
      fallbackLabel="Error budget"
    >
      <EsiContent searchParams={searchParams} />
    </AdminPageFrame>
  );
}
