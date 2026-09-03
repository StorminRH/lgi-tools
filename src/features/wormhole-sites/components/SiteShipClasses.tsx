import { summariseSiteShipClasses } from '../npc-summary';
import { SLEEPER_CLASS_LABEL } from '../sleeper-classes';
import type { SiteDetail } from '../types';
import { ShipClassIcon } from './ShipClassIcon';

export function SiteShipClasses({ site }: { site: SiteDetail }) {
  const classes = summariseSiteShipClasses(site);
  if (classes.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-3.5 border-t border-border-soft pt-2">
      {classes.map((c) => (
        <span key={c.code} className="inline-flex items-center gap-1.5">
          <ShipClassIcon code={c.code} size={18} />
          <span className="text-ui tracking-optical text-name">{SLEEPER_CLASS_LABEL[c.code]}</span>
          <span className="font-data text-ui tabular-nums text-muted">{c.count}</span>
        </span>
      ))}
    </div>
  );
}
