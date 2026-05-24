// Public query API for npc-stats. Pulls raw SDE attribute rows out of the
// `dgmTypeAttributes` table and runs the formulas in math.ts. Mission /
// incursion / abyssal NPC features can call this with their typeIds the same
// way wormhole-sites does.

import { getTypeAttributes, getTypeAttributesBatch } from '@/data/eve-data/queries';
import { composeCombatStats, missileTypeIdFor } from './math';
import type { CombatStats } from './types';

export async function getCombatStats(typeId: number): Promise<CombatStats | null> {
  const attrs = await getTypeAttributes(typeId);
  if (Object.keys(attrs).length === 0) return null;
  const missileTypeId = missileTypeIdFor(attrs);
  const missileAttrs = missileTypeId == null ? null : await getTypeAttributes(missileTypeId);
  return composeCombatStats(attrs, missileAttrs);
}

// Batched. One round-trip pulls every sleeper's attrs, a second pulls the
// distinct missile attrs. Hot path for listSiteDetails(), which fetches dozens
// of NPCs at once.
export async function getCombatStatsBatch(
  typeIds: number[],
): Promise<Map<number, CombatStats>> {
  const result = new Map<number, CombatStats>();
  if (typeIds.length === 0) return result;
  const sleeperAttrs = await getTypeAttributesBatch(typeIds);

  const missileIds = new Set<number>();
  for (const [, attrs] of sleeperAttrs) {
    const id = missileTypeIdFor(attrs);
    if (id != null) missileIds.add(id);
  }
  const missileAttrs = await getTypeAttributesBatch([...missileIds]);

  for (const typeId of typeIds) {
    const attrs = sleeperAttrs.get(typeId);
    if (!attrs || Object.keys(attrs).length === 0) continue;
    const missileId = missileTypeIdFor(attrs);
    const missile = missileId == null ? null : (missileAttrs.get(missileId) ?? null);
    result.set(typeId, composeCombatStats(attrs, missile));
  }
  return result;
}
