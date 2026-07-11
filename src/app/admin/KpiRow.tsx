import { isGscConfigured } from '@/data/gsc/constants';
import { getSearchTotals } from '@/data/gsc/queries';
import { getReturningVsNew, getSearchVsDirect } from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { KpiCard } from './KpiCard';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { buildKpiCards, previousRange, type RangeKey } from './period';
import { SectionUnavailable } from './SectionUnavailable';

// The dashboard's headline numbers. Each KPI runs its query twice — current
// window and the equal-length window before it — so the delta needs no new
// SQL. `all` has no previous window, so deltas are simply absent there.

const RANGE_NOUN: Record<Exclude<RangeKey, 'all'>, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
};

// Run a query only when its gate is on, else resolve to null — keeps the fan-out
// below a flat list instead of a wall of inline ternaries.
function maybe<T>(cond: boolean, thunk: () => Promise<T>): Promise<T | null> {
  return cond ? thunk() : Promise.resolve(null);
}

export async function KpiRow({ rangeKey, range }: { rangeKey: RangeKey; range: DateRange }) {
  const prev = previousRange(rangeKey, range);
  const gsc = isGscConfigured();

  const fetched = await loadSection('headline-metrics', () =>
    Promise.all([
      getSearchVsDirect(range),
      getReturningVsNew(range),
      maybe(gsc, () => getSearchTotals(range)),
      maybe(prev != null, () => getSearchVsDirect(prev!)),
      maybe(prev != null, () => getReturningVsNew(prev!)),
      maybe(gsc && prev != null, () => getSearchTotals(prev!)),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Headline metrics" />;

  const [pageViews, users, gscTotals, prevPageViews, prevUsers, prevGscTotals] = fetched;
  const cards = buildKpiCards({
    pageViews,
    users,
    gscTotals,
    prevPageViews,
    prevUsers,
    prevGscTotals,
  });

  return (
    <section>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {cards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>
      {prev && rangeKey !== 'all' && (
        <div className="mt-1.5 font-mono text-micro text-muted text-right">
          change vs the previous {RANGE_NOUN[rangeKey]}
        </div>
      )}
    </section>
  );
}
