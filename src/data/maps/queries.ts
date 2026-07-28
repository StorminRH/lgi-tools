import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { AnyPgDb } from '@/lib/db-types';
import type { MapGrant } from './access';
import { mapAccess, maps } from './schema';

/** Creator and archive state needed by the composed authorization gate. */
export interface MapAccessSubject {
  readonly userId: string;
  readonly archivedAt: Date | null;
}

/** Reads one map's creator and archive marker, or null when the map does not exist. */
export async function getMapAccessSubject(
  mapId: string,
  database: AnyPgDb = db,
): Promise<MapAccessSubject | null> {
  const [row] = await database
    .select({ userId: maps.userId, archivedAt: maps.archivedAt })
    .from(maps)
    .where(eq(maps.id, mapId))
    .limit(1);
  return row ?? null;
}

/** Reads every delegated grant for one map in the shape consumed by `resolveMapRole`. */
export async function getMapGrants(
  mapId: string,
  database: AnyPgDb = db,
): Promise<MapGrant[]> {
  return database
    .select({
      ownerType: mapAccess.ownerType,
      ownerId: mapAccess.ownerId,
      role: mapAccess.role,
    })
    .from(mapAccess)
    .where(eq(mapAccess.mapId, mapId));
}
