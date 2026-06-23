import { summariseSiteShipClasses } from '../npc-summary';
import type { SiteDetail } from '../types';
import { ShipClassIcon } from './ShipClassIcon';
import { SLEEPER_CLASS_LABEL } from './wormhole-styles';

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
    <div className="sites-card-ships">
      {classes.map((c) => (
        <span key={c.code} className="sites-card-ship">
          <ShipClassIcon code={c.code} size={18} />
          <span className="sites-card-ship-label">{SLEEPER_CLASS_LABEL[c.code]}</span>
          <span className="sites-card-ship-count">{c.count}</span>
        </span>
      ))}
    </div>
  );
}
