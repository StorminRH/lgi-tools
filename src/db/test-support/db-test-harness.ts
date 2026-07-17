import { drizzle as drizzlePg, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import { db as requestDb } from '@/db';
import { account, characters, user } from '@/features/auth/schema';
import { readEnv } from '@/lib/env';

// Real-Postgres test support is deliberately unzoned under `src/db/**`, so
// every slice can share one lifecycle primitive without creating a production
// dependency between feature or data slices.
// Schema, table, and foreign-key identifiers come only from in-repo suite
// constants. postgres-js cannot parameterize identifiers, so the lifecycle
// helpers use `unsafe` strictly for that trusted DDL/reset boundary.

type Sql = ReturnType<typeof postgres>;

const LOCAL_DB_URL = 'postgres://lgi:lgi@localhost:5433/lgi_tools';

/**
 * Configuration for one real-Postgres suite. `schema` must be unique per test
 * file. `tables` are cloned from the migrated local `public` schema via
 * `LIKE ... INCLUDING ALL`; list parents first so delete resets can wipe them
 * safely in reverse order. Foreign keys are not copied by `LIKE`, so suites
 * list the load-bearing relationships explicitly.
 */
export interface DbTestHarnessOptions {
  schema: string;
  tables: readonly string[];
  foreignKeys?: readonly DbForeignKey[];
  /**
   * Steer the request-path `db` proxy into the disposable schema. Required
   * whenever the code under test imports `@/db` instead of accepting a DB.
   */
  steerDbProxy?: boolean;
  /** Additional environment values read by the code under test. */
  env?: Readonly<Record<string, string>>;
  /**
   * Optional per-test wipe. Delete clears tables in reverse declaration order;
   * truncate clears the full set in one `TRUNCATE ... CASCADE` statement.
   */
  resetBetweenTests?: 'delete' | 'truncate';
}

/** One foreign key to restore after cloning tables from the public schema. */
export interface DbForeignKey {
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
  onDelete: 'cascade';
}

/**
 * Live handles for a suite whose harness reached Postgres. `sql` and `db` are
 * valid after the harness-owned `beforeAll`; reading either earlier or from a
 * skipped suite throws a pointed lifecycle error.
 */
export interface DbTestHarness {
  /** False when no Postgres answered; use it with `describe.skipIf`. */
  readonly reachable: boolean;
  /** Admin postgres-js client whose search path points at the disposable schema. */
  readonly sql: Sql;
  /** Drizzle instance over `sql`, used for seeds and direct assertions. */
  readonly db: PostgresJsDatabase;
}

/**
 * Own one real-Postgres suite's entire DB lifecycle. Call it once at test-file
 * top level: it probes `DATABASE_URL` or the local Docker default, registers
 * schema setup/reset/teardown hooks, and returns lazy handles. Disposable tables
 * clone the already-migrated local `public` schema, so run `pnpm db:migrate`
 * before the DB-backed suite. Unreachable databases skip cleanly instead of
 * failing collection.
 */
export async function createDbTestHarness(
  options: DbTestHarnessOptions,
): Promise<DbTestHarness> {
  const baseUrl = readEnv('DATABASE_URL') ?? LOCAL_DB_URL;
  const reachable = await canReachDb(baseUrl);
  let sql: Sql | undefined;
  let database: PostgresJsDatabase | undefined;

  beforeAll(async () => {
    if (!reachable) return;

    for (const [name, value] of Object.entries(options.env ?? {})) {
      vi.stubEnv(name, value);
    }
    if (options.steerDbProxy) {
      vi.stubEnv('LOCAL_DB_DRIVER', 'postgres-js');
      vi.stubEnv('DATABASE_URL', schemaUrl(baseUrl, options.schema));
    }

    sql = postgres(schemaUrl(baseUrl, options.schema), { max: 4, onnotice: () => {} });
    await setupDisposableSchema(sql, options.schema, options.tables);
    for (const foreignKey of options.foreignKeys ?? []) {
      await addForeignKey(sql, options.schema, foreignKey);
    }
    database = drizzlePg(sql);
  });

  if (options.resetBetweenTests) {
    beforeEach(async () => {
      if (!reachable) return;
      await resetTables(requireSql(sql), options);
    });
  }

  afterAll(async () => {
    if (!reachable) return;

    try {
      if (options.steerDbProxy) await closeRequestDbProxy();
    } finally {
      try {
        if (sql) await dropDisposableSchema(sql, options.schema);
      } finally {
        try {
          await sql?.end({ timeout: 5 }).catch(() => {});
        } finally {
          vi.unstubAllEnvs();
        }
      }
    }
  });

  return {
    reachable,
    get sql() {
      return requireSql(sql);
    },
    get db() {
      if (!database) {
        throw new Error('DB test harness Drizzle handle read before beforeAll completed.');
      }
      return database;
    },
  };
}

/**
 * Insert one Better Auth user row with valid name and email defaults derived
 * from `id`; caller overrides win field by field.
 */
export async function seedUser(
  database: PostgresJsDatabase,
  id: string,
  overrides?: Partial<typeof user.$inferInsert>,
): Promise<void> {
  await database.insert(user).values({
    id,
    name: `User ${id}`,
    email: `${id}@example.test`,
    ...overrides,
  });
}

/**
 * Insert one linked EVE account row for an existing user. The provider,
 * character account id, and timestamps use valid defaults; token and custody
 * scenarios supply their fields through `overrides`.
 */
export async function seedEveAccount(
  database: PostgresJsDatabase,
  base: { id: string; characterId: number; userId: string },
  overrides?: Partial<typeof account.$inferInsert>,
): Promise<void> {
  const now = new Date();
  await database.insert(account).values({
    id: base.id,
    accountId: String(base.characterId),
    providerId: 'eve',
    userId: base.userId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

/**
 * Insert one character profile row with valid name and portrait defaults
 * derived from the numeric character id; scenario-specific fields are caller
 * owned through `overrides`.
 */
export async function seedCharacter(
  database: PostgresJsDatabase,
  characterId: number,
  overrides?: Partial<typeof characters.$inferInsert>,
): Promise<void> {
  await database.insert(characters).values({
    characterId,
    name: `Character ${characterId}`,
    portraitUrl: `portrait-${characterId}`,
    ...overrides,
  });
}

function schemaUrl(base: string, schema: string): string {
  return `${base}${base.includes('?') ? '&' : '?'}search_path=${schema}`;
}

async function canReachDb(url: string): Promise<boolean> {
  const probe = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    await probe`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 1 }).catch(() => {});
  }
}

async function setupDisposableSchema(
  sql: Sql,
  schema: string,
  tableNames: readonly string[],
): Promise<void> {
  await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await sql.unsafe(`CREATE SCHEMA "${schema}"`);
  for (const table of tableNames) {
    await sql.unsafe(
      `CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`,
    );
  }
}

async function addForeignKey(sql: Sql, schema: string, foreignKey: DbForeignKey): Promise<void> {
  await sql.unsafe(
    `ALTER TABLE "${schema}"."${foreignKey.table}" ` +
      `ADD FOREIGN KEY ("${foreignKey.column}") ` +
      `REFERENCES "${schema}"."${foreignKey.refTable}" ("${foreignKey.refColumn}") ` +
      `ON DELETE ${foreignKey.onDelete.toUpperCase()}`,
  );
}

async function resetTables(sql: Sql, options: DbTestHarnessOptions): Promise<void> {
  if (options.resetBetweenTests === 'truncate') {
    const tables = options.tables.map((table) => `"${options.schema}"."${table}"`).join(', ');
    await sql.unsafe(`TRUNCATE TABLE ${tables} CASCADE`);
    return;
  }

  for (const table of [...options.tables].reverse()) {
    await sql.unsafe(`DELETE FROM "${options.schema}"."${table}"`);
  }
}

async function closeRequestDbProxy(): Promise<void> {
  const proxyClient = (requestDb as unknown as { $client: Sql }).$client;
  await proxyClient.end({ timeout: 5 }).catch(() => {});
}

async function dropDisposableSchema(sql: Sql, schema: string): Promise<void> {
  await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
}

function requireSql(sql: Sql | undefined): Sql {
  if (!sql) throw new Error('DB test harness SQL handle read before beforeAll completed.');
  return sql;
}
