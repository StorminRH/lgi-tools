import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '@/db';
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

/** Records a 200: the new expiry, ETag(s), Last-Modified and, for keepBody routes, the document itself. */
export async function recordResponse(meta: EsiResponseMeta): Promise<void> {
  const values = {
    expiresAt: toDate(meta.expiresAt),
    etags: [...meta.etags],
    lastModified: toDate(meta.lastModified),
    checkedAt: new Date(meta.checkedAt),
    body: meta.body ?? null,
  };
  await db
    .insert(esiResponses)
    .values({ ...rowIdentity(meta.key), ...values })
    .onConflictDoUpdate({ target: IDENTITY_COLUMNS, set: values });
}

export interface UnchangedRecord {
  readonly expiresAt: number | null;
  readonly lastModified: number | null;
  readonly checkedAt: number;
}

/** Records a 304: the new expiry and check time; the ETags and body stand, and Last-Modified only moves when the answer carried one. */
export async function recordUnchanged(key: EsiStoreKey, record: UnchangedRecord): Promise<void> {
  const expiresAt = toDate(record.expiresAt);
  const checkedAt = new Date(record.checkedAt);
  await db
    .insert(esiResponses)
    .values({ ...rowIdentity(key), expiresAt, lastModified: toDate(record.lastModified), checkedAt })
    .onConflictDoUpdate({
      target: IDENTITY_COLUMNS,
      set: {
        expiresAt,
        lastModified: sql`coalesce(excluded.last_modified, ${esiResponses.lastModified})`,
        checkedAt,
      },
    });
}
