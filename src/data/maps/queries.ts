import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { account, characters } from '@/db/auth-schema';
import type { AnyPgDb } from '@/lib/db-types';
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
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

/**
 * Resolves EVE-provider account owners for the given character ids in one batched
 * select. Non-EVE provider rows are ignored. Empty input returns an empty map
 * without querying.
 */
export async function getUserIdsOwningCharacters(
  characterIds: number[],
  database: AnyPgDb = db,
): Promise<Map<number, string>> {
  if (characterIds.length === 0) return new Map();

  const accountIds = characterIds.map(String);
  const rows = await database
    .select({
      accountId: account.accountId,
      userId: account.userId,
    })
    .from(account)
    .where(
      and(
        eq(account.providerId, EVE_PROVIDER_ID),
        inArray(account.accountId, accountIds),
      ),
    );

  const owners = new Map<number, string>();
  for (const row of rows) {
    const characterId = Number(row.accountId);
    if (Number.isFinite(characterId)) {
      owners.set(characterId, row.userId);
    }
  }
  return owners;
}

/**
 * Resolves every Better Auth user that currently has a linked character whose
 * cached corporation id is in the given set. Empty input returns an empty set
 * without querying. Character ids are selected first, then owners resolve
 * through the text-keyed EVE account lookup so non-numeric non-EVE account ids
 * never enter a bigint cast.
 */
export async function getUserIdsInCorporations(
  corporationIds: number[],
  database: AnyPgDb = db,
): Promise<Set<string>> {
  if (corporationIds.length === 0) return new Set();

  const characterRows = await database
    .select({ characterId: characters.characterId })
    .from(characters)
    .where(inArray(characters.corporationId, corporationIds));

  const owners = await getUserIdsOwningCharacters(
    characterRows.map((row) => row.characterId),
    database,
  );
  return new Set(owners.values());
}

/**
 * Distinct map ids that hold a corporation grant for one of the given corporation
 * ids. Used by character purge to capture corp-derived projections before the
 * durable grant rows disappear.
 */
export async function getMapIdsWithCorporationGrants(
  corporationIds: number[],
  database: AnyPgDb = db,
): Promise<string[]> {
  if (corporationIds.length === 0) return [];

  const rows = await database
    .selectDistinct({ mapId: mapAccess.mapId })
    .from(mapAccess)
    .where(
      and(
        eq(mapAccess.ownerType, 'corporation'),
        inArray(mapAccess.ownerId, corporationIds),
      ),
    );
  return rows.map((row) => row.mapId);
}

/**
 * Distinct map ids that hold a direct character grant for the given character.
 */
export async function getMapIdsWithCharacterGrant(
  characterId: number,
  database: AnyPgDb = db,
): Promise<string[]> {
  const rows = await database
    .selectDistinct({ mapId: mapAccess.mapId })
    .from(mapAccess)
    .where(
      and(
        eq(mapAccess.ownerType, 'character'),
        eq(mapAccess.ownerId, characterId),
      ),
    );
  return rows.map((row) => row.mapId);
}

/** Owned map ids for one creator, captured before a user purge deletes them. */
export async function getOwnedMapIds(
  userId: string,
  database: AnyPgDb = db,
): Promise<string[]> {
  const rows = await database
    .select({ id: maps.id })
    .from(maps)
    .where(eq(maps.userId, userId));
  return rows.map((row) => row.id);
}

/** Cached corporation id for one character profile, or null when absent/unknown. */
export async function getCharacterCorporationId(
  characterId: number,
  database: AnyPgDb = db,
): Promise<number | null> {
  const [row] = await database
    .select({ corporationId: characters.corporationId })
    .from(characters)
    .where(eq(characters.characterId, characterId))
    .limit(1);
  return row?.corporationId ?? null;
}
