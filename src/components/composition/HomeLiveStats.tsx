import { cn } from '@/components/ui/cn';
import { Dot } from '@/components/ui/dot';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { getCachedBlueprintCount } from '@/data/eve-data/queries';
import { getCachedSdeVersion } from '@/data/eve-data/meta';
import { getCachedPricesFreshness, getCachedTrackedTypeCount } from '@/data/market-prices/cache';
import { getCachedSiteCount } from '@/features/wormhole-sites/queries';
import { formatQuantity } from '@/lib/format/number';
import { formatUtcDate } from '@/lib/format/time';

export async function HomeLiveStats() {
  const [sde, sites, blueprints, trackedTypes, prices] = await Promise.all([
    getCachedSdeVersion(),
    getCachedSiteCount(),
    getCachedBlueprintCount(),
    getCachedTrackedTypeCount(),
    getCachedPricesFreshness(),
  ]);

  const stats: { label: string; value: string; compact?: boolean }[] = [
    { label: 'Wormhole sites', value: formatQuantity(sites) },
    { label: 'Blueprints & reactions', value: formatQuantity(blueprints) },
    { label: 'Market items priced', value: formatQuantity(trackedTypes) },
    { label: 'Jita prices updated', value: formatUtcDate(prices.lastUpdatedAt), compact: true },
  ];

  return (
    <section aria-label="Live dataset status">
      <SectionLabel
        className="mb-cluster"
        meta={
          <span className="inline-flex items-center gap-2 font-data text-label uppercase tracking-wide text-muted">
            <Dot tone="green" />
            Updated on demand
          </span>
        }
      >
        Live data
      </SectionLabel>

      <Card className="overflow-hidden">
        <dl className="grid grid-cols-2">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={cn(
                'flex flex-col gap-1.5 px-5 py-5 border-border-soft',
                i % 2 === 0 && 'border-r',
                i < 2 && 'border-b',
              )}
            >
              <dt className="order-2 font-data text-label uppercase tracking-label text-muted">
                {stat.label}
              </dt>
              <dd
                className={cn(
                  'order-1 font-data font-semibold text-name tabular-nums',
                  stat.compact ? 'text-lead leading-[26px]' : 'text-stat leading-none',
                )}
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border-soft bg-bg-deep/40">
          <span className="font-data text-label uppercase tracking-wide text-muted">
            EVE SDE
          </span>
          <span className="text-right font-data text-micro text-muted">
            <span className="text-name">{sde.version ?? '—'}</span>
            {sde.ingestedAt ? (
              <span className="text-muted"> · ingested {formatUtcDate(sde.ingestedAt)}</span>
            ) : null}
          </span>
        </div>
      </Card>
    </section>
  );
}
