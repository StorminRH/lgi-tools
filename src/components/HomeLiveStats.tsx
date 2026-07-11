import { cn } from '@/components/ui/cn';
import { SectionLabel } from '@/components/ui/section-label';
import { getCachedBlueprintCount } from '@/data/eve-data/queries';
import { getCachedSdeVersion } from '@/data/eve-data/meta';
import { getCachedPricesFreshness, getCachedTrackedTypeCount } from '@/data/market-prices/cache';
import { getCachedSiteCount } from '@/features/wormhole-sites/queries';
import { formatQuantity } from '@/lib/format/number';
import { formatUtcDate } from '@/lib/format/time';

// The home hero's live-data hook — a compact panel of the catalogue + market
// freshness numbers that prove the tools sit on a living dataset. Identical for
// anonymous and signed-in visitors and built entirely from cached, no-arg
// accessors, so it prerenders into the static shell (no per-request work). Dates
// are absolute UTC — a live "x ago" would freeze at build time. This supersedes
// the old bottom-of-page Status card; the same five reads now lead the page.
export async function HomeLiveStats() {
  const [sde, sites, blueprints, trackedTypes, prices] = await Promise.all([
    getCachedSdeVersion(),
    getCachedSiteCount(),
    getCachedBlueprintCount(),
    getCachedTrackedTypeCount(),
    getCachedPricesFreshness(),
  ]);

  // `compact` marks a value that is text (a date) rather than a short tally, so
  // it renders a step smaller — a 26px date overflows the half-width stat cell.
  const stats: { label: string; value: string; compact?: boolean }[] = [
    { label: 'Wormhole sites', value: formatQuantity(sites) },
    { label: 'Blueprints & reactions', value: formatQuantity(blueprints) },
    { label: 'Market items priced', value: formatQuantity(trackedTypes) },
    { label: 'Jita prices updated', value: formatUtcDate(prices.lastUpdatedAt), compact: true },
  ];

  return (
    <section aria-label="Live dataset status">
      <SectionLabel
        className="mb-4"
        meta={
          <span className="inline-flex items-center gap-2 font-mono text-label uppercase tracking-[0.12em] text-muted">
            <span className="size-[6px] rounded-full bg-isk shadow-[0_0_8px_var(--color-card-glow-shadow)]" />
            Updated on demand
          </span>
        }
      >
        Live data
      </SectionLabel>

      <div className="rounded-[6px] border border-border bg-section overflow-hidden">
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
              {/* DOM order is <dt> then <dd> — valid <dl> semantics and natural
                  reading order ("label, value"); `order` flips the visual so the
                  value still sits on top. */}
              <dt className="order-2 font-mono text-label uppercase tracking-[0.1em] text-muted">
                {stat.label}
              </dt>
              <dd
                className={cn(
                  'order-1 font-jb font-semibold text-name tabular-nums',
                  stat.compact ? 'text-lead leading-[26px]' : 'text-stat leading-none',
                )}
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border-soft bg-bg-deep/40">
          <span className="font-mono text-label uppercase tracking-[0.12em] text-muted">
            EVE SDE
          </span>
          <span className="text-right font-mono text-micro text-muted">
            <span className="text-name">{sde.version ?? '—'}</span>
            {sde.ingestedAt ? (
              <span className="text-muted"> · ingested {formatUtcDate(sde.ingestedAt)}</span>
            ) : null}
          </span>
        </div>
      </div>
    </section>
  );
}
