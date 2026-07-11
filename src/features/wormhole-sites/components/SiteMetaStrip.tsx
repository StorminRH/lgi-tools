// Meta strip rendered above the SiteCard on the /sites/[id] deep-link
// page. Two label/value pairs: the originating Sheet tab and the last
// market-price refresh. Stateless and presentational — the page passes
// already-computed values in.
import { formatRelativeTime } from '@/lib/format/time';

export function SiteMetaStrip({
  source,
  lastPriceUpdate,
}: {
  source: string;
  lastPriceUpdate: Date | null;
}) {
  return (
    <div className="flex items-center gap-8 px-1 py-3 border-y border-border-soft text-[11px]">
      <div className="flex items-baseline gap-2">
        <span className="text-caption tracking-[0.18em] uppercase text-muted">
          Source
        </span>
        <span className="text-name font-mono">{source}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-caption tracking-[0.18em] uppercase text-muted">
          Last price update
        </span>
        <span className="text-name font-mono">{formatRelativeTime(lastPriceUpdate)}</span>
      </div>
    </div>
  );
}
