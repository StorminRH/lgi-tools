import { isSleeperClassCode, type SleeperClassCode } from './schema';
import { SLEEPER_CLASS_ORDER } from './sleeper-classes';
import type { SiteDetail } from './types';

export interface ShipClassSummary {
  code: SleeperClassCode;
  count: number;
}

export function summariseSiteShipClasses(site: SiteDetail): ShipClassSummary[] {
  const counts = new Map<SleeperClassCode, number>();

  for (const wave of site.waves) {
    for (const npc of wave.npcs) {
      const code = npc.sleeperClassCode;
      if (!isSleeperClassCode(code)) continue;
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
