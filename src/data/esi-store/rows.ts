import { and, eq, gt, or, sql, type Query, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db, runAtomically } from '@/db';
import { directDatabase } from '@/db/direct-database';
import { chunk } from '@/lib/array';
import type { AnyPgDb } from '@/lib/db-types';
import { excluded, excludedSet, proposedRowsWhere } from '@/lib/db-upsert';
import type { EsiRoute } from '@/lib/esi-datasets/routes';
import type { SaveOutcome } from '@/platform/owner-sync';
import { identityText, rowIdentity, type EsiResponseHolderType, type RowIdentity } from './key';
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

/** Deletes the stored row of each key; a key with no row is nothing to delete. */
export async function deleteStoredRows(keys: readonly EsiStoreKey[]): Promise<void> {
  if (keys.length === 0) return;
  await db.delete(esiResponses).where(or(...keys.map((key) => identityWhere(rowIdentity(key)))));
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
 * multi-row upsert may not touch the same row twice in one statement. The
 * records come back in identity order, so two writers that share keys lock
 * their rows in the same order and never deadlock on each other.
 */
function dedupeByIdentity<T extends { readonly key: EsiStoreKey }>(records: readonly T[]): T[] {
  const byIdentity = new Map<string, T>();
  for (const record of records) byIdentity.set(identityText(rowIdentity(record.key)), record);
  return [...byIdentity.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, record]) => record);
}

/**
 * An answer replaces a stored one only when it was asked for no earlier: a
 * slow refresh that asked first and lands last never puts its older answer
 * over a newer one. The conflicting row is locked either way, so writers of
 * one key queue behind each other inside their transactions (or, at
 * serializable isolation, the later one fails and reruns).
 */
const NO_OLDER_ANSWER = sql`${esiResponses.checkedAt} <= ${excluded(esiResponses.checkedAt)}`;

/** The esi_responses rows a set of 200s proposes: one per identity, in identity order. */
function answerRows(metas: readonly EsiResponseMeta[]) {
  return dedupeByIdentity(metas).map((meta) => ({
    ...rowIdentity(meta.key),
    expiresAt: toDate(meta.expiresAt),
    etags: [...meta.etags],
    lastModified: toDate(meta.lastModified),
    checkedAt: new Date(meta.checkedAt),
    body: meta.body ?? null,
  }));
}

type AnswerRow = ReturnType<typeof answerRows>[number];

const ANSWER_COLUMNS = ['expiresAt', 'etags', 'lastModified', 'checkedAt', 'body'] as const;

/**
 * Records committed 200s, many rows a statement: each row's new expiry,
 * ETag(s), Last-Modified and, for keepBody routes, the document itself,
 * every value taken from the row proposed rather than from any one meta.
 * A row whose stored answer was asked for later keeps it. Says whether
 * every proposed row was written, which is false once any was older.
 */
export async function recordResponses(metas: readonly EsiResponseMeta[], database: AnyPgDb = db): Promise<boolean> {
  const rows = answerRows(metas);
  let written = 0;
  for (const batch of chunk(rows, UPSERT_CHUNK_SIZE)) {
    const stored = await database
      .insert(esiResponses)
      .values(batch)
      .onConflictDoUpdate({
        target: IDENTITY_COLUMNS,
        set: excludedSet(esiResponses, ANSWER_COLUMNS),
        setWhere: NO_OLDER_ANSWER,
      })
      .returning({ route: esiResponses.route });
    written += stored.length;
  }
  return written === rows.length;
}

/** Each row's key holds an answer asked for after this one: true once any does. */
function anyNewerAnswer(rows: readonly AnswerRow[]): SQL {
  const newer = rows.map((row) => sql`(${identityWhere(row)} and ${gt(esiResponses.checkedAt, row.checkedAt)})`);
  return sql`exists (select 1 from ${esiResponses} where ${sql.join(newer, sql` or `)})`;
}

/**
 * Every row's key now holds this very answer (the same checked_at): what a
 * domain statement of the same commit requires before it writes. No rows
 * vouch for nothing, so nothing is required.
 */
function answersStand(rows: readonly AnswerRow[]): SQL {
  if (rows.length === 0) return sql`true`;
  const held = rows.map(
    (row) => sql`exists (select 1 from ${esiResponses} where ${identityWhere(row)} and ${eq(esiResponses.checkedAt, row.checkedAt)})`,
  );
  return sql.join(held, sql` and `);
}

/**
 * One owner's answers and the domain statements they vouch for, in one
 * atomic HTTP batch (runAtomically: serializable, one request on Neon's
 * stateless driver). The answers go first, all or none: none is written
 * while any key already holds an answer asked for later, and each upsert
 * keeps a later stored answer besides. Every domain statement carries
 * `answersStand` in its WHERE, so it writes only once this refresh's
 * answers are the stored ones. A concurrent refresh of the same keys makes
 * Postgres reject one batch as a serialization failure, and that batch
 * reruns against the winner's answers. 'superseded' wrote nothing at all.
 */
export async function recordWithStatements(
  metas: readonly EsiResponseMeta[],
  build: ((answersStand: SQL) => readonly { toSQL(): Query }[]) | undefined,
): Promise<SaveOutcome> {
  const rows = answerRows(metas);
  const answers = rows.length === 0
    ? []
    : [
        db
          .insert(esiResponses)
          .select(proposedRowsWhere(esiResponses, rows, sql`not ${anyNewerAnswer(rows)}`))
          .onConflictDoUpdate({ target: IDENTITY_COLUMNS, set: excludedSet(esiResponses, ANSWER_COLUMNS), setWhere: NO_OLDER_ANSWER })
          .returning({ route: esiResponses.route }),
      ];
  const [recorded = []] = await runAtomically([...answers, ...(build?.(answersStand(rows)) ?? [])]);
  return rows.length === 0 || recorded.length === rows.length ? 'saved' : 'superseded';
}

/** Thrown inside the commit transaction to roll it back: a newer answer already stands. */
class Superseded extends Error {}

/**
 * One owner's answers and a domain write that must hold row locks (an
 * owner snapshot replace), in one transaction on the direct client. The
 * answers go first: their upsert locks each key's row, so a second refresh
 * of the same owner waits here until this one commits, and an answer asked
 * for before the stored one rolls the whole transaction back, the write
 * never running. A write that reports 'superseded' rolls its answers back
 * the same way. Either way nothing changed, and the newer answer and its
 * data stand together.
 */
export async function recordWithTransaction(
  metas: readonly EsiResponseMeta[],
  run: (tx: AnyPgDb) => Promise<SaveOutcome>,
): Promise<SaveOutcome> {
  try {
    await directDatabase().transaction(async (tx) => {
      if (!(await recordResponses(metas, tx))) throw new Superseded();
      if ((await run(tx)) === 'superseded') throw new Superseded();
    });
  } catch (error) {
    if (error instanceof Superseded) return 'superseded';
    throw error;
  }
  return 'saved';
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
 * answer carried one. A row answered later keeps that answer. Nothing to
 * record is no statement at all.
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
        setWhere: NO_OLDER_ANSWER,
      });
  }
}
