import postgres from 'postgres';

// Test-support for the DB-execution coverage suites (queries.db.test.ts). These
// run the real admin analytics queries against the local Docker Postgres so a
// query that only fails when Postgres plans it (the OOB.1 42803 class) is caught
// in the suite instead of in production. Lives under `src/db/**` — unzoned, so
// both data slices may import it without tripping a fallow boundary, the same way
// they already import the `db` proxy from `@/db`.

type Sql = ReturnType<typeof postgres>;

// The local Docker Postgres (`docker compose up -d` on :5433) that `pnpm dev` and
// the migration/SDE scripts target. A plain string constant, never a `process.env`
// read, so the server-env lint rule can't fire in this non-test module; the test
// files (lint-exempt) pass an override when DATABASE_URL is set in the shell.
export const LOCAL_DB_URL = 'postgres://lgi:lgi@localhost:5433/lgi_tools';

// Append a `search_path` startup parameter to a connection URL. postgres-js
// forwards any unknown URL query param as a Postgres startup parameter, so the
// resulting connection resolves unqualified table names inside <schema> first —
// the lever that steers the request-path `db` proxy into a disposable test schema
// with no change to the query source.
export function schemaUrl(base: string, schema: string): string {
  return `${base}${base.includes('?') ? '&' : '?'}search_path=${schema}`;
}

// True iff a Postgres answers at `url`. Gates the DB-execution suites: with no
// reachable DB (CI, a DB-less `pnpm verify`) it returns false and the suite skips.
// Never rejects — a refused or hung connection resolves false so test collection
// can't error on it.
export async function canReachDb(url: string): Promise<boolean> {
  const probe = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    await probe`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    try {
      await probe.end({ timeout: 1 });
    } catch {
      // Closing a probe that never connected is best-effort.
    }
  }
}

// Create a throwaway schema holding empty clones of the named public tables.
// `LIKE ... INCLUDING ALL` copies columns, types, defaults, indexes, and checks
// from the live table, so there is no DDL to drift out of sync; foreign keys are
// deliberately not copied (LIKE never copies them), so seed rows need no parent
// rows. The names are in-repo test constants, so `unsafe` interpolation carries
// no injection surface.
export async function setupDisposableSchema(
  adminClient: Sql,
  schema: string,
  tableNames: readonly string[],
): Promise<void> {
  await adminClient.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  for (const t of tableNames) {
    await adminClient.unsafe(
      `CREATE TABLE "${schema}"."${t}" (LIKE public."${t}" INCLUDING ALL)`,
    );
  }
}

// Drop the throwaway schema and everything it holds (tables and cloned sequences).
export async function dropDisposableSchema(adminClient: Sql, schema: string): Promise<void> {
  await adminClient.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
}
