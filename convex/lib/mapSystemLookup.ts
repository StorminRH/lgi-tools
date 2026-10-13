import { ConvexError } from 'convex/values';
import { isTombstoned } from '@/data/maps/chain-contract';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { isPositiveSafeInteger } from '@/lib/id-schemas';
import { requireMapAccess } from './mapAccess';

export function requireSystemId(systemId: number): void {
  if (!isPositiveSafeInteger(systemId)) {
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

/** The system's row on the map, or null when it is missing or tombstoned. */
export async function findLiveSystem(
  ctx: QueryCtx,
  mapId: string,
  systemId: number,
): Promise<Doc<'mapSystems'> | null> {
  const system = await findSystem(ctx, mapId, systemId);
  return system === null || isTombstoned(system) ? null : system;
}

/**
 * Loads the system's live row on the map, or throws `error` exactly as given
 * when the row is missing or tombstoned. Callers keep their own code and detail.
 */
export async function requireLiveSystem(
  ctx: QueryCtx,
  mapId: string,
  systemId: number,
  error: { readonly code: string; readonly detail?: string } = { code: 'UNKNOWN_SYSTEM' },
): Promise<Doc<'mapSystems'>> {
  requireSystemId(systemId);
  const system = await findLiveSystem(ctx, mapId, systemId);
  if (system === null) throw new ConvexError(error);
  return system;
}

export async function beginSystemEdit(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<void> {
  await requireMapAccess(ctx, mapId, 'edit');
  requireSystemId(systemId);
}
