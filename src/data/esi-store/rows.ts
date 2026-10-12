import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { identityText, rowIdentity, type RowIdentity } from './key';
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
