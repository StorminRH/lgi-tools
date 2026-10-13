import { eyebrow } from '@/components/ui/type-roles';
import { formatRelativeTime } from '@/lib/format/time';

export function SiteMetaStrip({
  source,
  lastPriceUpdate,
  now,
}: {
  source: string;
  lastPriceUpdate: Date | null;
  now?: number;
}) {
  return (
    <div className="flex items-center gap-8 px-1 py-3 border-y border-border-soft text-ui">
      <div className="flex items-baseline gap-2">
        <span className={eyebrow({ font: 'inherit', weight: 'inherit' })}>
          Source
        </span>
        <span className="text-name font-data">{source}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={eyebrow({ font: 'inherit', weight: 'inherit' })}>
          Last price update
        </span>
        <span className="text-name font-data">
          {formatRelativeTime(lastPriceUpdate, now)}
        </span>
      </div>
    </div>
  );
}
