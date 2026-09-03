import { getTypeAttributesBatch } from '@/data/eve-data/queries';
import { composeCombatStats, missileTypeIdFor } from './math';
import type { CombatStats } from './types';

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
