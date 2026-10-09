import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { db, directClient } from '@/db';
import { account, characters, user } from '@/db/auth-schema';
import { groupBy, sortedUniqueIds } from '@/lib/array';
import type { AnyPgDb } from '@/lib/db-types';
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import {
  resolveMapRole,
  type MapGrant,
  type MapPrincipals,
} from './access';
import type { MapAccessOwnerType, MapRole } from './access-contract';
import { activeMapLifecycle, MAP_DELETE_GRACE_MS } from './lifecycle-contract';
import {
  MAP_ACCESS_PROJECTION_REVISION_SEQUENCE,
  mapAccess,
  mapBlockAccounts,
  mapBlocks,
  maps,
} from './schema';
import {
  authorizedAdminMapsSelection,
  enqueuePendingMapAccessSelection,
  mapAuthorizationRows,
  recordBlockedCharacterHolders,
  userBlockedFromMap,
  type PendingMapAccessChange,
} from './authorization-sql';

export interface CreateMapGrant {
  readonly ownerType: MapAccessOwnerType;
  readonly ownerId: number;
  readonly role: MapRole;
}

export async function reserveMapAccessProjectionRevision(
  database: AnyPgDb = db,
): Promise<number> {
  // public. pins the production sequence; disposable-schema harnesses steer via search_path elsewhere.
  const [row] = await mapAuthorizationRows<{ revision: string | number }>(database, sql`
    SELECT nextval(
      ${`public.${MAP_ACCESS_PROJECTION_REVISION_SEQUENCE}`}::regclass
    )::text AS revision
  `);
  const raw = row?.revision;
  const revision = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isSafeInteger(revision) || revision <= 0) {
    throw new Error('Map access projection sequence returned an invalid revision.');
  }
  return revision;
}

export type MapGrantChange =
  | {
      readonly operation: 'upsert';
      readonly grant: {
        readonly ownerType: MapAccessOwnerType;
        readonly ownerId: number;
        readonly role: MapRole;
      };
    }
  | {
      readonly operation: 'revoke';
      readonly principal: {
        readonly ownerType: MapAccessOwnerType;
        readonly ownerId: number;
      };
    };

export type MapAuthorizationProvenance =
  | { readonly kind: 'created' }
  | { readonly kind: 'corporation'; readonly corporationIds: readonly number[] }
  | { readonly kind: 'direct'; readonly characterIds: readonly number[] };

export interface AuthorizedMapRow {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly creatorName: string;
  readonly role: MapRole;
  readonly provenance: MapAuthorizationProvenance;
}

export interface DeletedRestorableMapRow extends AuthorizedMapRow {
  readonly archivedAt: Date;
}

export interface MapGrantRow extends MapGrant {
  readonly mapId: string;
}

export interface MapGrantWithProvenance extends MapGrant {
  readonly grantedAt: Date;
}

interface RawAuthorizedMapRow {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly archivedAt: Date | null;
  readonly creatorName: string;
  readonly ownerType: MapAccessOwnerType | null;
  readonly ownerId: number | null;
  readonly role: MapRole | null;
}

function principalGrantCondition(principals: MapPrincipals) {
  const direct = principals.characterIds.length === 0
    ? undefined
    : and(
        eq(mapAccess.ownerType, 'character'),
        inArray(mapAccess.ownerId, principals.characterIds),
      );
  const corporation = principals.corporationIds.length === 0
    ? undefined
    : and(
        eq(mapAccess.ownerType, 'corporation'),
        inArray(mapAccess.ownerId, principals.corporationIds),
      );
  return or(direct, corporation) ?? sql<boolean>`false`;
}

async function readAuthorizedMapRows(
  userId: string,
  principals: MapPrincipals,
  lifecycleCondition: SQL | undefined,
  database: AnyPgDb,
): Promise<RawAuthorizedMapRow[]> {
  const rows = await database
    .select({
      id: maps.id,
      userId: maps.userId,
      name: maps.name,
      createdAt: maps.createdAt,
      archivedAt: maps.archivedAt,
      creatorName: user.name,
      ownerType: mapAccess.ownerType,
      ownerId: mapAccess.ownerId,
      role: mapAccess.role,
    })
    .from(maps)
    .innerJoin(user, eq(user.id, maps.userId))
    .leftJoin(
      mapAccess,
      and(
        eq(mapAccess.mapId, maps.id),
        principalGrantCondition(principals),
      ),
    )
    .where(
      and(
        lifecycleCondition,
        or(
          eq(maps.userId, userId),
          and(isNotNull(mapAccess.mapId), not(userBlockedFromMap(userId, maps.id))),
        ),
      ),
    )
    .orderBy(desc(maps.createdAt), asc(maps.id));
  return rows;
}

function provenanceRank(provenance: MapAuthorizationProvenance): number {
  if (provenance.kind === 'created') return 0;
  if (provenance.kind === 'corporation') return 1;
  return 2;
}

function compareAuthorizedMaps(left: AuthorizedMapRow, right: AuthorizedMapRow): number {
  const byProvenance = provenanceRank(left.provenance) - provenanceRank(right.provenance);
  if (byProvenance !== 0) return byProvenance;
  const byCreatedAt = right.createdAt.getTime() - left.createdAt.getTime();
  return byCreatedAt === 0 ? left.id.localeCompare(right.id) : byCreatedAt;
}

function grantFromRow(row: RawAuthorizedMapRow): MapGrant | null {
  return row.ownerType === null || row.ownerId === null || row.role === null
    ? null
    : { ownerType: row.ownerType, ownerId: row.ownerId, role: row.role };
}

function matchedPrincipalIds(
  grants: readonly MapGrant[],
  ownerType: MapAccessOwnerType,
  principalIds: readonly number[],
): number[] {
  return sortedUniqueIds(
    grants
      .filter((grant) =>
        grant.ownerType === ownerType && principalIds.includes(grant.ownerId),
      )
      .map((grant) => grant.ownerId),
  );
}

function resolveProvenance(
  isCreator: boolean,
  grants: readonly MapGrant[],
  principals: MapPrincipals,
): MapAuthorizationProvenance {
  if (isCreator) return { kind: 'created' };
  const corporationIds = matchedPrincipalIds(
    grants,
    'corporation',
    principals.corporationIds,
  );
  return corporationIds.length > 0
    ? { kind: 'corporation', corporationIds }
    : {
        kind: 'direct',
        characterIds: matchedPrincipalIds(
          grants,
          'character',
          principals.characterIds,
        ),
      };
}

function materializeAuthorizedMap(
  group: readonly RawAuthorizedMapRow[],
  userId: string,
  principals: MapPrincipals,
): (AuthorizedMapRow & { readonly archivedAt: Date | null }) | null {
  const first = group[0];
  if (first === undefined) return null;
  const isCreator = first.userId === userId;
  const grants = group.flatMap((row) => {
    const grant = grantFromRow(row);
    return grant === null ? [] : [grant];
  });
  const access = resolveMapRole({ isCreator, grants, principals });
  if (access.role === null || !access.canView) return null;
  return {
    id: first.id,
    name: first.name,
    createdAt: first.createdAt,
    archivedAt: first.archivedAt,
    creatorName: first.creatorName,
    role: access.role,
    provenance: resolveProvenance(isCreator, grants, principals),
  };
}

function materializeAuthorizedMaps(
  rows: readonly RawAuthorizedMapRow[],
  userId: string,
  principals: MapPrincipals,
): Array<AuthorizedMapRow & { readonly archivedAt: Date | null }> {
  return [...groupBy(rows, (row) => row.id).values()]
    .flatMap((group) => {
      const map = materializeAuthorizedMap(group, userId, principals);
      return map === null ? [] : [map];
    })
    .sort(compareAuthorizedMaps);
}

export async function createMapAtomic(
  userId: string,
  name: string,
  grants: readonly CreateMapGrant[],
  database: AnyPgDb = db,
): Promise<string> {
  const mapId = randomUUID();
  const encodedGrants = JSON.stringify(
    grants.map((grant) => ({
      owner_type: grant.ownerType,
      owner_id: grant.ownerId,
      role: grant.role,
    })),
  );
  await database.execute(sql`
    WITH created_map AS (
      INSERT INTO ${maps} (
        id, user_id, name, archived_at, purge_requested_at,
        lifecycle_status, lifecycle_entered_at, character_scoped_at
      )
      VALUES (
        ${mapId}, ${userId}, ${name}, now(), now(),
        'purge_queued'::"public"."map_lifecycle_status", now(), now()
      )
      RETURNING id
    )
    INSERT INTO ${mapAccess} (map_id, owner_type, owner_id, role)
    SELECT
      created_map.id,
      grant_row.owner_type::"public"."map_access_owner_type",
      grant_row.owner_id,
      grant_row.role::"public"."map_role"
    FROM created_map
    CROSS JOIN jsonb_to_recordset(${encodedGrants}::jsonb)
      AS grant_row(owner_type text, owner_id bigint, role text)
  `);
  return mapId;
}

export async function publishCreatedMap(
  mapId: string,
  database: AnyPgDb = db,
): Promise<void> {
  const now = new Date();
  const published = await database
    .update(maps)
    .set({ ...activeMapLifecycle(now), updatedAt: now })
    .where(
      and(
        eq(maps.id, mapId),
        isNotNull(maps.archivedAt),
        isNotNull(maps.purgeRequestedAt),
        isNull(maps.purgeClaimedAt),
        isNull(maps.tombstonedAt),
      ),
    )
    .returning({ id: maps.id });
  if (published.length !== 1) {
    throw new Error(`Map creation publish expected one staged row, updated ${published.length}.`);
  }
}

export async function compensateFailedMapCreation(
  mapId: string,
  database: AnyPgDb = db,
): Promise<{ readonly outcome: 'deleted' | 'purge-owned' }> {
  const deleted = await database
    .delete(maps)
    .where(and(eq(maps.id, mapId), isNull(maps.purgeClaimedAt)))
    .returning({ id: maps.id });
  if (deleted.length === 1) return { outcome: 'deleted' };

  const [retained] = await database
    .select({ purgeClaimedAt: maps.purgeClaimedAt })
    .from(maps)
    .where(eq(maps.id, mapId))
    .limit(1);
  if (retained?.purgeClaimedAt !== null && retained?.purgeClaimedAt !== undefined) {
    return { outcome: 'purge-owned' };
  }
  throw new Error('Map creation compensation found neither its row nor a purge claim.');
}

export async function listAuthorizedMapsForPrincipals(
  userId: string,
  principals: MapPrincipals,
  database: AnyPgDb = db,
): Promise<AuthorizedMapRow[]> {
  const rows = await readAuthorizedMapRows(
    userId,
    principals,
    and(isNull(maps.archivedAt), isNull(maps.tombstonedAt)),
    database,
  );
  return materializeAuthorizedMaps(rows, userId, principals).map(
    ({ archivedAt: _archivedAt, ...row }) => row,
  );
}

export async function listDeletedRestorableMapsForPrincipals(
  userId: string,
  principals: MapPrincipals,
  database: AnyPgDb = db,
  now: Date = new Date(),
): Promise<DeletedRestorableMapRow[]> {
  const rows = await readAuthorizedMapRows(
    userId,
    principals,
    and(
      isNotNull(maps.archivedAt),
      isNull(maps.tombstonedAt),
      isNull(maps.purgeRequestedAt),
      isNull(maps.purgeClaimedAt),
      gt(maps.archivedAt, new Date(now.getTime() - MAP_DELETE_GRACE_MS)),
    ),
    database,
  );
  return materializeAuthorizedMaps(rows, userId, principals).flatMap((row) =>
    row.role === 'admin' && row.archivedAt !== null
      ? [{ ...row, archivedAt: row.archivedAt }]
      : [],
  );
}

export interface MapAccessSubject {
  readonly userId: string;
  readonly archivedAt: Date | null;
  readonly characterScopedAt: Date | null;
}

export async function getMapAccessSubject(
  mapId: string,
  database: AnyPgDb = db,
): Promise<MapAccessSubject | null> {
  const [row] = await database
    .select({
      userId: maps.userId,
      archivedAt: maps.archivedAt,
      characterScopedAt: maps.characterScopedAt,
    })
    .from(maps)
    .where(and(eq(maps.id, mapId), isNull(maps.tombstonedAt)))
    .limit(1);
  return row ?? null;
}

export async function getMapGrants(
  mapId: string,
  database: AnyPgDb = db,
): Promise<MapGrantWithProvenance[]> {
  return database
    .select({
      ownerType: mapAccess.ownerType,
      ownerId: mapAccess.ownerId,
      role: mapAccess.role,
      grantedAt: mapAccess.grantedAt,
    })
    .from(mapAccess)
    .where(eq(mapAccess.mapId, mapId));
}

export async function getCharacterNames(
  characterIds: readonly number[],
  database: AnyPgDb = db,
): Promise<ReadonlyMap<number, string>> {
  if (characterIds.length === 0) return new Map();
  const rows = await database
    .select({ characterId: characters.characterId, name: characters.name })
    .from(characters)
    .where(inArray(characters.characterId, [...characterIds]));
  return new Map(rows.map((row) => [row.characterId, row.name]));
}

export async function getAuthorizedMapGrantsForMaps(
  userId: string,
  principals: MapPrincipals,
  mapIds: readonly string[],
  database: AnyPgDb = db,
): Promise<MapGrantRow[]> {
  const uniqueMapIds = [...new Set(mapIds)];
  if (uniqueMapIds.length === 0) return [];
  const rows = await mapAuthorizationRows<{
    mapId: string;
    ownerType: MapAccessOwnerType;
    ownerId: number | string;
    role: MapRole;
  }>(database, sql`
    WITH authorized_map AS (
      ${activeMapsAdminSelection(userId, principals, uniqueMapIds)}
    )
    SELECT
      delegated_grant.map_id AS "mapId",
      delegated_grant.owner_type AS "ownerType",
      delegated_grant.owner_id AS "ownerId",
      delegated_grant.role AS "role"
    FROM ${mapAccess} AS delegated_grant
    INNER JOIN authorized_map ON authorized_map.id = delegated_grant.map_id
    ORDER BY delegated_grant.map_id, delegated_grant.owner_type, delegated_grant.owner_id
  `);
  return rows.map((row) => ({ ...row, ownerId: Number(row.ownerId) }));
}

function activeMapsAdminSelection(
  userId: string,
  principals: MapPrincipals,
  mapIds: readonly string[],
) {
  return authorizedAdminMapsSelection(
    userId,
    principals,
    mapIds,
    sql`${maps.archivedAt} IS NULL AND ${maps.tombstonedAt} IS NULL`,
  );
}

function activeMapAdminSelection(
  userId: string,
  principals: MapPrincipals,
  mapId: string,
) {
  return activeMapsAdminSelection(userId, principals, [mapId]);
}

export type MapGrantChangeResult =
  | PendingMapAccessChange
  | { readonly reason: 'creator-character-required' }
  | null;

export async function applyAuthorizedMapGrantChange(
  userId: string,
  principals: MapPrincipals,
  mapId: string,
  change: MapGrantChange,
  database: AnyPgDb = db,
): Promise<MapGrantChangeResult> {
  if (change.operation === 'upsert') {
    return writeAuthorizedGrantChange(userId, principals, mapId, change, database);
  }
  // Revokes on one map run one at a time, so the last-own-character guard
  // reads the grants the previous revoke left behind.
  const writer = database === db ? drizzle(directClient) : database;
  return writer.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT ${maps.id} FROM ${maps} WHERE ${maps.id} = ${mapId} FOR UPDATE`);
    if (change.principal.ownerType === 'character'
      && await isCreatorsLastCharacterGrant(userId, principals, mapId, change.principal.ownerId, transaction)) {
      return { reason: 'creator-character-required' };
    }
    return writeAuthorizedGrantChange(userId, principals, mapId, change, transaction);
  });
}

async function writeAuthorizedGrantChange(
  userId: string,
  principals: MapPrincipals,
  mapId: string,
  change: MapGrantChange,
  database: AnyPgDb,
): Promise<PendingMapAccessChange | null> {
  const mutation = change.operation === 'upsert' ? sql`
    INSERT INTO ${mapAccess} (map_id, owner_type, owner_id, role)
    SELECT authorized_map.id,
      ${change.grant.ownerType}::"public"."map_access_owner_type",
      ${change.grant.ownerId}, ${change.grant.role}::"public"."map_role"
    FROM authorized_map
    ON CONFLICT (map_id, owner_type, owner_id)
    DO UPDATE SET role = EXCLUDED.role
  ` : sql`
    DELETE FROM ${mapAccess}
    WHERE ${mapAccess.mapId} IN (SELECT id FROM authorized_map)
      AND ${mapAccess.ownerType} = ${change.principal.ownerType}
      AND ${mapAccess.ownerId} = ${change.principal.ownerId}
      AND ${keepsCreatorsLastCharacter(mapId)}
  `;
  const [row] = await mapAuthorizationRows<PendingMapAccessChange>(database, sql`
    WITH authorized_map AS (
      ${activeMapAdminSelection(userId, principals, mapId)}
    ), changed AS (${mutation})
    ${enqueuePendingMapAccessSelection(sql`SELECT id FROM authorized_map`)}
  `);
  return row ?? null;
}

/** On a character-scoped map, the grants that name one of the creator's own linked characters. */
function creatorCharacterGrantIds(mapId: string) {
  return sql`
    SELECT creator_grant.owner_id
    FROM ${mapAccess} AS creator_grant
    INNER JOIN ${maps} AS creator_map ON creator_map.id = creator_grant.map_id
    INNER JOIN ${account} AS creator_account
      ON creator_account.user_id = creator_map.user_id
      AND creator_account.provider_id = ${EVE_PROVIDER_ID}
      AND creator_account.account_id = creator_grant.owner_id::text
    WHERE creator_grant.map_id = ${mapId}
      AND creator_map.character_scoped_at IS NOT NULL
      AND creator_grant.owner_type = 'character'::"public"."map_access_owner_type"
  `;
}

/** Holds back a revoke that would strip the creator of their last own-character grant. */
function keepsCreatorsLastCharacter(mapId: string) {
  return sql`
    NOT (
      ${mapAccess.ownerType} = 'character'::"public"."map_access_owner_type"
      AND ${mapAccess.ownerId} IN (${creatorCharacterGrantIds(mapId)})
      AND (SELECT count(*) FROM (${creatorCharacterGrantIds(mapId)}) AS held) = 1
    )
  `;
}

/**
 * True when the caller administers the map and revoking this character grant
 * would leave the creator with none of their own characters on it.
 */
export async function isCreatorsLastCharacterGrant(
  userId: string,
  principals: MapPrincipals,
  mapId: string,
  characterId: number,
  database: AnyPgDb = db,
): Promise<boolean> {
  const rows = await mapAuthorizationRows<{ ownerId: number | string }>(database, sql`
    WITH authorized_map AS (
      ${activeMapAdminSelection(userId, principals, mapId)}
    )
    SELECT held.owner_id AS "ownerId"
    FROM (${creatorCharacterGrantIds(mapId)}) AS held
    WHERE EXISTS (SELECT 1 FROM authorized_map)
  `);
  return rows.length === 1 && Number(rows[0]?.ownerId) === characterId;
}

export async function getMapAccessCandidateUserIds(
  characterIds: readonly number[],
  corporationIds: readonly number[],
  database: AnyPgDb = db,
): Promise<string[]> {
  if (characterIds.length === 0 && corporationIds.length === 0) return [];
  const rows = await database
    .selectDistinct({ userId: account.userId })
    .from(account)
    .where(and(
      eq(account.providerId, EVE_PROVIDER_ID),
      or(
        characterIds.length === 0 ? undefined : inArray(account.accountId, characterIds.map(String)),
        corporationIds.length === 0 ? undefined : inArray(
          account.accountId,
          database.select({ accountId: sql<string>`${characters.characterId}::text` })
            .from(characters)
            .where(inArray(characters.corporationId, [...corporationIds])),
        ),
      ),
    ));
  return rows.map((row) => row.userId);
}

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

export function characterGrantCondition(characterId: number): SQL {
  return sql`
    ${mapAccess.ownerType} = 'character'::"public"."map_access_owner_type"
    AND ${mapAccess.ownerId} = ${characterId}
  `;
}

/** Maps whose grants name the character or its corporation. */
function grantedMapIdsSelection(characterId: number): SQL {
  return sql`
    SELECT DISTINCT ${mapAccess.mapId} AS id
    FROM ${mapAccess}
    WHERE (${characterGrantCondition(characterId)}) OR (
      ${mapAccess.ownerType} = 'corporation'::"public"."map_access_owner_type"
      AND ${mapAccess.ownerId} = (
        SELECT ${characters.corporationId}
        FROM ${characters}
        WHERE ${characters.characterId} = ${characterId}
      )
    )
  `;
}

export function affectedMapIdsSelection(characterId: number): SQL {
  return sql`
    ${grantedMapIdsSelection(characterId)}
    UNION
    SELECT ${mapBlocks.mapId} AS id
    FROM ${mapBlocks}
    WHERE ${mapBlocks.characterId} = ${characterId}
  `;
}

export async function getGrantedMapIdsForCharacter(
  characterId: number,
  database: AnyPgDb = db,
): Promise<string[]> {
  const rows = await mapAuthorizationRows<{ id: string }>(database, grantedMapIdsSelection(characterId));
  return rows.map((row) => row.id);
}

export async function enqueueAffectedMapAccessChanges(
  characterId: number,
  database: AnyPgDb = db,
): Promise<PendingMapAccessChange[]> {
  return mapAuthorizationRows<PendingMapAccessChange>(database, sql`
    WITH recorded AS (
      ${recordBlockedCharacterHolders(characterId)}
    ), affected AS (
      ${affectedMapIdsSelection(characterId)}
    )
    ${enqueuePendingMapAccessSelection(sql`SELECT id FROM affected`)}
  `);
}

export async function enqueueMergeReprojection(
  database: AnyPgDb,
  args: { sourceUserId: string; movedCharacterIds: readonly number[] },
): Promise<PendingMapAccessChange[]> {
  const selections = [
    sql`SELECT ${maps.id} AS id FROM ${maps} WHERE ${maps.userId} = ${args.sourceUserId}`,
    sql`
      SELECT ${mapBlocks.mapId} AS id
      FROM ${mapBlocks}
      INNER JOIN ${mapBlockAccounts} ON ${mapBlockAccounts.blockId} = ${mapBlocks.id}
      WHERE ${mapBlockAccounts.userId} = ${args.sourceUserId}
    `,
    ...args.movedCharacterIds.map((characterId) => affectedMapIdsSelection(characterId)),
  ];
  return mapAuthorizationRows<PendingMapAccessChange>(database, sql`
    WITH affected AS (
      ${sql.join(selections, sql` UNION `)}
    )
    ${enqueuePendingMapAccessSelection(sql`SELECT id FROM affected`)}
  `);
}
