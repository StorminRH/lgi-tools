import { summariseSiteShipClasses } from '../npc-summary';
import { SLEEPER_CLASS_LABEL } from '../sleeper-classes';
import type { SiteDetail } from '../types';
import { ShipClassIcon } from './ShipClassIcon';

/**
 * The collapsed card's at-a-glance NPC hull-class mix: the red overview glyph
 * for each class present, with its label and total count. Derived from the
 * already-loaded wave/NPC tree (no fetch), so it stays in the static card
 * summary while the full per-NPC detail remains in the lazily-mounted body.
 * Renders nothing for sites with no Sleeper presence (pure ore/gas).
 */
export function SiteShipClasses({ site }: { site: SiteDetail }) {
  const classes = summariseSiteShipClasses(site);
  if (classes.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-3.5 border-t border-border-soft pt-2">
      {classes.map((c) => (
        <span key={c.code} className="inline-flex items-center gap-1.5">
          <ShipClassIcon code={c.code} size={18} />
          <span className="text-ui tracking-[0.02em] text-name">{SLEEPER_CLASS_LABEL[c.code]}</span>
          <span className="font-jb text-ui tabular-nums text-muted">{c.count}</span>
        </span>
      ))}
    </div>
  );
}
