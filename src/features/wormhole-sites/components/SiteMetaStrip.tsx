// Meta strip rendered above the SiteCard on the /sites/[id] deep-link
// page. Two label/value pairs: the originating Sheet tab and the last
// market-price refresh. Stateless and presentational — the page passes
// already-computed values in.

function formatRelative(date: Date | null): string {
  if (!date) return '—';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

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
        <span className="text-name font-mono">{formatRelative(lastPriceUpdate)}</span>
      </div>
    </div>
  );
}
