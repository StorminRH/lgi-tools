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
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { db } from '@/db';
import { account, characters, user } from '@/db/auth-schema';
import type { AnyPgDb } from '@/lib/db-types';
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import {
  resolveMapRole,
  type MapGrant,
  type MapPrincipals,
} from './access';
import type { MapRole } from './access-contract';
import { activeMapLifecycle } from './lifecycle-contract';
import {
  MAP_ACCESS_PROJECTION_REVISION_SEQUENCE,
  mapAccess,
  maps,
  type MapAccessOwnerType,
} from './schema';
import {
  authorizedAdminMapsSelection,
  mapAuthorizationRows,
} from './authorization-sql';

export const MAP_DELETE_GRACE_MS = 30 * 24 * 60 * 60 * 1_000;

export interface CreateMapGrant {
  readonly ownerType: MapAccessOwnerType;
  readonly ownerId: number;
  readonly role: Extract<MapRole, 'viewer' | 'editor'>;
}

export async function reserveMapAccessProjectionRevision(
  database: AnyPgDb = db,
): Promise<number> {
  const result = await database.execute(sql`
    SELECT nextval(
      ${MAP_ACCESS_PROJECTION_REVISION_SEQUENCE}::regclass
    )::text AS revision
  `);
  const row = mapAuthorizationRows(result)[0];
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
        or(eq(maps.userId, userId), isNotNull(mapAccess.mapId)),
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
  return [
    ...new Set(
      grants
        .filter((grant) =>
          grant.ownerType === ownerType && principalIds.includes(grant.ownerId),
        )
        .map((grant) => grant.ownerId),
    ),
  ].sort((left, right) => left - right);
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
  const grouped = new Map<string, RawAuthorizedMapRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.id) ?? [];
    group.push(row);
    grouped.set(row.id, group);
  }

  return [...grouped.values()]
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
        lifecycle_status, lifecycle_entered_at
      )
      VALUES (
        ${mapId}, ${userId}, ${name}, now(), now(),
        'purge_queued'::"public"."map_lifecycle_status", now()
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
}

export async function getMapAccessSubject(
  mapId: string,
  database: AnyPgDb = db,
): Promise<MapAccessSubject | null> {
  const [row] = await database
    .select({ userId: maps.userId, archivedAt: maps.archivedAt })
    .from(maps)
    .where(and(eq(maps.id, mapId), isNull(maps.tombstonedAt)))
    .limit(1);
  return row ?? null;
}

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

export async function getAuthorizedMapGrantsForMaps(
  userId: string,
  principals: MapPrincipals,
  mapIds: readonly string[],
  database: AnyPgDb = db,
): Promise<MapGrantRow[]> {
  const uniqueMapIds = [...new Set(mapIds)];
  if (uniqueMapIds.length === 0) return [];
  const result = await database.execute<
    Record<string, unknown> & {
      mapId: string;
      ownerType: MapAccessOwnerType;
      ownerId: number | string;
      role: MapRole;
    }
  >(sql`
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
  return mapAuthorizationRows(result).map(
    (row: {
      mapId: string;
      ownerType: MapAccessOwnerType;
      ownerId: number | string;
      role: MapRole;
    }) => ({
      ...row,
      ownerId: Number(row.ownerId),
    }),
  );
}

type MapGrantUpsert = Extract<MapGrantChange, { readonly operation: 'upsert' }>;
type MapGrantRevoke = Extract<MapGrantChange, { readonly operation: 'revoke' }>;

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

async function applyAuthorizedMapGrantUpsert(
  userId: string,
  principals: MapPrincipals,
  mapId: string,
  change: MapGrantUpsert,
  database: AnyPgDb,
): Promise<boolean> {
  const result = await database.execute<{ authorized: boolean }>(sql`
      WITH authorized_map AS (
        ${activeMapAdminSelection(userId, principals, mapId)}
      ), changed AS (
        INSERT INTO ${mapAccess} (map_id, owner_type, owner_id, role)
        SELECT
          authorized_map.id,
          ${change.grant.ownerType}::"public"."map_access_owner_type",
          ${change.grant.ownerId},
          ${change.grant.role}::"public"."map_role"
        FROM authorized_map
        ON CONFLICT (map_id, owner_type, owner_id)
        DO UPDATE SET role = EXCLUDED.role
      )
      SELECT EXISTS (SELECT 1 FROM authorized_map) AS authorized
    `);
  return mapAuthorizationRows(result)[0]?.authorized === true;
}

async function applyAuthorizedMapGrantRevoke(
  userId: string,
  principals: MapPrincipals,
  mapId: string,
  change: MapGrantRevoke,
  database: AnyPgDb,
): Promise<boolean> {
  const result = await database.execute<{ authorized: boolean }>(sql`
    WITH authorized_map AS (
      ${activeMapAdminSelection(userId, principals, mapId)}
    ), changed AS (
      DELETE FROM ${mapAccess}
      WHERE ${mapAccess.mapId} IN (SELECT id FROM authorized_map)
        AND ${mapAccess.ownerType} = ${change.principal.ownerType}
        AND ${mapAccess.ownerId} = ${change.principal.ownerId}
    )
    SELECT EXISTS (SELECT 1 FROM authorized_map) AS authorized
  `);
  return mapAuthorizationRows(result)[0]?.authorized === true;
}

export function applyAuthorizedMapGrantChange(
  userId: string,
  principals: MapPrincipals,
  mapId: string,
  change: MapGrantChange,
  database: AnyPgDb = db,
): Promise<boolean> {
  return change.operation === 'upsert'
    ? applyAuthorizedMapGrantUpsert(userId, principals, mapId, change, database)
    : applyAuthorizedMapGrantRevoke(userId, principals, mapId, change, database);
}

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

export async function affectedMapIdsForCharacter(
  characterId: number,
  database: AnyPgDb = db,
): Promise<string[]> {
  const [corporationId, characterMaps] = await Promise.all([
    getCharacterCorporationId(characterId, database),
    getMapIdsWithCharacterGrant(characterId, database),
  ]);
  const corporationMaps =
    corporationId === null
      ? []
      : await getMapIdsWithCorporationGrants([corporationId], database);
  return [...new Set([...characterMaps, ...corporationMaps])];
}
