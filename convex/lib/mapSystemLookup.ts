// Shared indexed map/system lookup and id validation for authoring + fixtures.
import { ConvexError } from 'convex/values';
import type { MutationCtx } from '../_generated/server';
import { requireMapAccess } from './mapAccess';
import { isPositiveId } from './mapEntityContracts';

/** Rejects a system ID that is not a positive safe integer. */
export function requireSystemId(systemId: number): void {
  if (!isPositiveId(systemId)) {
    throw new ConvexError({
      code: 'INVALID_SYSTEM_ID',
      detail: 'A system ID must be a positive safe integer.',
    });
  }
}

/** The one indexed map/system lookup shared by every chain write that needs ownership. */
export function findSystem(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
) {
  return ctx.db
    .query('mapSystems')
    .withIndex('by_map_system', (q) => q.eq('mapId', mapId).eq('systemId', systemId))
    .unique();
}

/** Gate edit access and validate the system id — shared authoring/fixture preamble. */
export async function beginSystemEdit(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<void> {
  await requireMapAccess(ctx, mapId, 'edit');
  requireSystemId(systemId);
}
