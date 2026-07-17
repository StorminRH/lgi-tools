import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * The app runs two Drizzle drivers — neon-http (`@/db` request path) and
 * postgres-js (`drizzle(client)` in the scripts/crons + the direct endpoint).
 * Helpers reachable from both, or called from inside a `db.transaction`, accept
 * this shared base type: both concrete databases extend Drizzle's `PgDatabase`,
 * and these helpers use only its shared query-builder surface (select / insert /
 * upsert / execute — never an interactive `.transaction`). One alias, one
 * documented `any`, instead of a per-file copy.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPgDb = PgDatabase<any, any, any>;

/**
 * The postgres-js-CONCRETE database (the schema generic Drizzle infers for
 * `drizzle(client)`). The SDE ingest pipeline needs this, not the dual-driver
 * base above: it runs the TRUNCATE + bulk refill inside an interactive
 * `.transaction`, which only postgres-js provides — typing it as either driver
 * would let a neon-http handle (no interactive transactions) through at compile
 * time. No `any` needed — this is the exact type the driver produces.
 */
export type PostgresJsDb = PostgresJsDatabase<Record<string, unknown>>;
