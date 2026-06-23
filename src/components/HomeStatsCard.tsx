import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { getCachedBlueprintCount } from '@/data/eve-data/queries';
import { getCachedSdeVersion } from '@/data/eve-data/meta';
import { getCachedPricesFreshness, getCachedTrackedTypeCount } from '@/data/market-prices/cache';
import { getCachedSiteCount } from '@/features/wormhole-sites/queries';
import { formatQuantity } from '@/lib/format/number';
import { formatUtcDate } from '@/lib/format/time';

// The shared service-health / catalogue card — identical for anonymous and
// signed-in visitors. Public-safe freshness/status only (SDE build + date,
// catalogue counts, market-price freshness); deliberately NO usage telemetry.
// Every read is a cached, no-arg accessor so the card prerenders into the static
// shell. Dates are absolute UTC (a live "x ago" would freeze at build time).
export async function HomeStatsCard() {
  const [sde, sites, blueprints, trackedTypes, prices] = await Promise.all([
    getCachedSdeVersion(),
    getCachedSiteCount(),
    getCachedBlueprintCount(),
    getCachedTrackedTypeCount(),
    getCachedPricesFreshness(),
  ]);

  const rows: { label: string; value: string; sub?: string }[] = [
    {
      label: 'EVE SDE build',
      value: sde.version ?? '—',
      sub: sde.ingestedAt ? `ingested ${formatUtcDate(sde.ingestedAt)}` : undefined,
    },
    { label: 'Wormhole sites', value: formatQuantity(sites) },
    { label: 'Blueprints & reactions', value: formatQuantity(blueprints) },
    { label: 'Market items priced', value: formatQuantity(trackedTypes) },
    { label: 'Jita prices updated', value: formatUtcDate(prices.lastUpdatedAt) },
  ];

  return (
    <section>
      <SectionLabel className="mb-4">Status</SectionLabel>
      <Card>
        <dl className="divide-y divide-border-soft">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-3 px-3.5 py-2.5"
            >
              <dt className="text-[12px] text-muted">{row.label}</dt>
              <dd className="text-right">
                <span className="font-mono text-[13px] text-name">{row.value}</span>
                {row.sub ? (
                  <span className="block font-mono text-caption text-muted">{row.sub}</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}
