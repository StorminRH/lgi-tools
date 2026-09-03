import { ConvexError } from 'convex/values';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { requireMapAccess } from './mapAccess';
import { isPositiveId } from './mapEntityContracts';

export function requireSystemId(systemId: number): void {
  if (!isPositiveId(systemId)) {
    throw new ConvexError({
      code: 'INVALID_SYSTEM_ID',
      detail: 'A system ID must be a positive safe integer.',
    });
  }
}

export function findSystem(
  ctx: QueryCtx,
  mapId: string,
  systemId: number,
) {
  return ctx.db
    .query('mapSystems')
    .withIndex('by_map_system', (q) => q.eq('mapId', mapId).eq('systemId', systemId))
    .unique();
}

export async function beginSystemEdit(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<void> {
  await requireMapAccess(ctx, mapId, 'edit');
  requireSystemId(systemId);
}
