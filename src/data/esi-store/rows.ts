import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import { chunk } from '@/lib/array';
import { excluded, excludedSet } from '@/lib/db-upsert';
import type { EsiRoute } from '@/lib/esi-datasets/routes';
import type { EsiHolder } from '@/lib/esi-datasets/types';
import { holderColumns, identityText, rowIdentity, type EsiResponseHolderType, type RowIdentity } from './key';
import { esiResponses } from './schema';
import type { EsiResponseMeta, EsiStoreKey, StoredRow } from './types';

function identityWhere(identity: RowIdentity): SQL {
  return sql`(${and(
    eq(esiResponses.route, identity.route),
    eq(esiResponses.holderType, identity.holderType),
    eq(esiResponses.holderId, identity.holderId),
    eq(esiResponses.userId, identity.userId),
    eq(esiResponses.params, identity.params),
  )})`;
}

/**
 * The ON clause that joins a holder-keyed table to its stored answer for
 * `route`: one row per holder, with no parameters and no user, so a reader
 * (stored roles, affiliations) can select the expiry beside its own columns.
 */
export function storedRowJoin(route: EsiRoute, holderType: EsiResponseHolderType, holderId: PgColumn): SQL {
  return sql`(${and(
    eq(esiResponses.route, route),
    eq(esiResponses.holderType, holderType),
    eq(esiResponses.holderId, holderId),
    eq(esiResponses.userId, ''),
    eq(esiResponses.params, ''),
  )})`;
}

const dateMs = (value: Date | null): number | null => (value === null ? null : value.getTime());

const toDate = (value: number | null): Date | null => (value === null ? null : new Date(value));

type SelectedRow = typeof esiResponses.$inferSelect;

function toStoredRow(row: SelectedRow): StoredRow {
  return {
    expiresAt: dateMs(row.expiresAt),
    etags: row.etags,
    lastModified: dateMs(row.lastModified),
    checkedAt: row.checkedAt.getTime(),
    body: row.body,
  };
}

/** The stored row of each key, in key order, null where none exists. */
export async function readStoredRows(keys: readonly EsiStoreKey[]): Promise<(StoredRow | null)[]> {
  if (keys.length === 0) return [];
  const identities = keys.map(rowIdentity);
  const rows = await db
    .select()
    .from(esiResponses)
    .where(or(...identities.map(identityWhere)));
  const byIdentity = new Map(rows.map((row) => [identityText(row), toStoredRow(row)] as const));
  return identities.map((identity) => byIdentity.get(identityText(identity)) ?? null);
}

/**
 * The earliest expiry over every stored answer of `route` for `holder`,
 * whatever its parameters: the lifetime of a reader that aggregates a whole
 * route (the prices freshness stamp). Null when no answer is stored or any
 * of them has no expiry, since that key is due.
 */
export async function readRouteExpiry(route: EsiRoute, holder: EsiHolder): Promise<number | null> {
  const columns = holderColumns(holder);
  const [row] = await db
    .select({
      // Epoch ms as text: a bare sql<> timestamp would come back as a string in the driver's own format.
      earliestMs: sql<string | null>`(extract(epoch from min(${esiResponses.expiresAt})) * 1000)::bigint`,
      anyDue: sql<boolean>`coalesce(bool_or(${esiResponses.expiresAt} IS NULL), false)`,
    })
    .from(esiResponses)
    .where(and(
      eq(esiResponses.route, route),
      eq(esiResponses.holderType, columns.holderType),
      eq(esiResponses.holderId, columns.holderId),
      eq(esiResponses.userId, columns.userId),
    ));
  if (row === undefined || row.earliestMs === null || row.anyDue) return null;
  return Number(row.earliestMs);
}

const IDENTITY_COLUMNS = [
  esiResponses.route,
  esiResponses.holderType,
  esiResponses.holderId,
  esiResponses.userId,
  esiResponses.params,
];

/** Rows per esi_responses statement: ten binds a row at most, far below the driver's parameter cap. */
const UPSERT_CHUNK_SIZE = 1000;

/**
 * One record per row identity, the last one for a repeated key winning: a
 * multi-row upsert may not touch the same row twice in one statement.
 */
function dedupeByIdentity<T extends { readonly key: EsiStoreKey }>(records: readonly T[]): T[] {
  const byIdentity = new Map<string, T>();
  for (const record of records) byIdentity.set(identityText(rowIdentity(record.key)), record);
  return [...byIdentity.values()];
}

/**
 * Records committed 200s, many rows a statement: each row's new expiry,
 * ETag(s), Last-Modified and, for keepBody routes, the document itself,
 * every value taken from the row proposed rather than from any one meta.
 */
export async function recordResponses(metas: readonly EsiResponseMeta[]): Promise<void> {
  const rows = dedupeByIdentity(metas).map((meta) => ({
    ...rowIdentity(meta.key),
    expiresAt: toDate(meta.expiresAt),
    etags: [...meta.etags],
    lastModified: toDate(meta.lastModified),
    checkedAt: new Date(meta.checkedAt),
    body: meta.body ?? null,
  }));
  for (const batch of chunk(rows, UPSERT_CHUNK_SIZE)) {
    await db
      .insert(esiResponses)
      .values(batch)
      .onConflictDoUpdate({
        target: IDENTITY_COLUMNS,
        set: excludedSet(esiResponses, ['expiresAt', 'etags', 'lastModified', 'checkedAt', 'body']),
      });
  }
}

export interface UnchangedRecord {
  readonly key: EsiStoreKey;
  readonly expiresAt: number | null;
  readonly lastModified: number | null;
  readonly checkedAt: number;
}

/**
 * Records 304s, many rows a statement: each row's new expiry and check
 * time; the ETags and body stand, and Last-Modified only moves where the
 * answer carried one. Nothing to record is no statement at all.
 */
export async function recordUnchangedMany(records: readonly UnchangedRecord[]): Promise<void> {
  const rows = dedupeByIdentity(records).map((record) => ({
    ...rowIdentity(record.key),
    expiresAt: toDate(record.expiresAt),
    lastModified: toDate(record.lastModified),
    checkedAt: new Date(record.checkedAt),
  }));
  for (const batch of chunk(rows, UPSERT_CHUNK_SIZE)) {
    await db
      .insert(esiResponses)
      .values(batch)
      .onConflictDoUpdate({
        target: IDENTITY_COLUMNS,
        set: {
          expiresAt: excluded(esiResponses.expiresAt),
          lastModified: sql`coalesce(${excluded(esiResponses.lastModified)}, ${esiResponses.lastModified})`,
          checkedAt: excluded(esiResponses.checkedAt),
        },
      });
  }
}
