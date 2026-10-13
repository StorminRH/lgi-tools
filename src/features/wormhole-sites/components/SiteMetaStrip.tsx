import { eyebrow } from '@/components/ui/type-roles';
import { PriceUpdateAge } from './PriceUpdateAge';

export function SiteMetaStrip({
  source,
  lastPriceUpdate,
}: {
  source: string;
  lastPriceUpdate: Date | null;
}) {
  return (
    <div className="flex items-center gap-8 px-1 py-3 border-y border-border-soft text-ui">
      <div className="flex items-baseline gap-2">
        <span className={eyebrow({ font: 'inherit', weight: 'inherit', emphasis: 'strong' })}>
          Source
        </span>
        <span className="text-name font-data">{source}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={eyebrow({ font: 'inherit', weight: 'inherit', emphasis: 'strong' })}>
          Last price update
        </span>
        <span className="text-name font-data">
          <PriceUpdateAge updatedAt={lastPriceUpdate} />
        </span>
      </div>
    </div>
  );
}
