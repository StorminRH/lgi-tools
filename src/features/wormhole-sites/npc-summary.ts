import type { SleeperClassCode } from './schema';
import type { SiteDetail } from './types';
import { SLEEPER_CLASS_LABEL, SLEEPER_CLASS_ORDER } from './components/wormhole-styles';

export interface ShipClassSummary {
  code: SleeperClassCode;
  /** Total NPC count of this hull class across every wave in the site. */
  count: number;
}

function isKnownClass(code: string): code is SleeperClassCode {
  return Object.prototype.hasOwnProperty.call(SLEEPER_CLASS_LABEL, code);
}

/**
 * Whole-site NPC hull-class mix for the card's at-a-glance strip. Reduces the
 * already-loaded wave/NPC tree (no new fetch) into one entry per hull class
 * present, summing counts. Classes are emitted in `SLEEPER_CLASS_ORDER`; codes
 * outside the known set are ignored so an unexpected value never breaks the card.
 */
export function summariseSiteShipClasses(site: SiteDetail): ShipClassSummary[] {
  const counts = new Map<SleeperClassCode, number>();

  for (const wave of site.waves) {
    for (const npc of wave.npcs) {
      const code = npc.sleeperClassCode;
      if (!isKnownClass(code)) continue;
      counts.set(code, (counts.get(code) ?? 0) + npc.quantity);
    }
  }

  const summary: ShipClassSummary[] = [];
  for (const code of SLEEPER_CLASS_ORDER) {
    const count = counts.get(code);
    if (count) summary.push({ code, count });
  }
  return summary;
}
