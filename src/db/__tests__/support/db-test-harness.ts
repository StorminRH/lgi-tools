import { drizzle as drizzlePg, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import { db as requestDb, type Sql } from '@/db';
import { account, characters, user } from '@/db/auth-schema';
import { readEnv } from '@/lib/env';

const LOCAL_DB_URL = 'postgres://lgi:lgi@localhost:5433/lgi_tools';

/**
 * Configuration for one real-Postgres suite. `schema` must be unique per test
 * file. `tables` are cloned from the migrated local `public` schema via
 * `LIKE ... INCLUDING ALL`; list parents first so delete resets can wipe them
 * safely in reverse order. Serial defaults still point at `public.*_id_seq`
 * after the clone, so setup rebinds them onto sequences owned by the
 * disposable schema. Foreign keys are not copied by `LIKE`, so suites
 * list the load-bearing relationships explicitly.
 */
export interface DbTestHarnessOptions {
  schema: string;
  tables: readonly string[];
  foreignKeys?: readonly DbForeignKey[];
  steerDbProxy?: boolean;
  env?: Readonly<Record<string, string>>;
  resetBetweenTests?: 'delete' | 'truncate';
}

export interface DbForeignKey {
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
  onDelete: 'cascade';
}

export interface DbTestHarness {
  readonly reachable: boolean;
  readonly sql: Sql;
  readonly db: PostgresJsDatabase;
}

/**
 * Resolve the suite URL and whether Postgres answered. An explicit
 * `DATABASE_URL` that does not accept a connection fails closed so CI cannot
 * treat skipped `*.db.test.ts` files as a green run. An unset URL still
 * probes the local Docker default and skips when that daemon is down.
 */
export async function probeHarnessDatabase(
  explicitUrl: string | undefined = readEnv('DATABASE_URL'),
): Promise<{ baseUrl: string; reachable: boolean }> {
  const baseUrl = explicitUrl ?? LOCAL_DB_URL;
  const reachable = await canReachDb(baseUrl);
  if (explicitUrl && !reachable) {
    throw new Error(
      'DATABASE_URL is set but Postgres did not accept a connection. ' +
        'Refusing to skip *.db.test.ts.',
    );
  }
  return { baseUrl, reachable };
}

export async function createDbTestHarness(
  options: DbTestHarnessOptions,
): Promise<DbTestHarness> {
  const { baseUrl, reachable } = await probeHarnessDatabase();
  let sql: Sql | undefined;
  let database: PostgresJsDatabase | undefined;

  beforeAll(async () => {
    if (!reachable) return;

    steerHarnessEnvironment(options, baseUrl);
    sql = postgres(schemaUrl(baseUrl, options.schema), { max: 4, onnotice: () => {} });
    await setupDisposableSchema(sql, options.schema, options.tables);
    await addForeignKeys(sql, options);
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
  await rebindClonedSerialDefaults(sql, schema, tableNames);
}

function steerHarnessEnvironment(options: DbTestHarnessOptions, baseUrl: string): void {
  for (const [name, value] of Object.entries(options.env ?? {})) {
    vi.stubEnv(name, value);
  }
  if (options.steerDbProxy) {
    vi.stubEnv('LOCAL_DB_DRIVER', 'postgres-js');
    vi.stubEnv('DATABASE_URL', schemaUrl(baseUrl, options.schema));
  }
}

async function rebindClonedSerialDefaults(
  sql: Sql,
  schema: string,
  tableNames: readonly string[],
): Promise<void> {
  for (const table of tableNames) {
    const columns = (await sql.unsafe(
      `SELECT a.attname AS column_name
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
       WHERE n.nspname = '${schema}'
         AND c.relname = '${table}'
         AND a.attnum > 0
         AND NOT a.attisdropped
         AND a.attidentity = ''
         AND pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval(%'`,
    )) as { column_name: string }[];

    for (const { column_name: column } of columns) {
      const sequence = `${table}_${column}_seq`;
      await sql.unsafe(`CREATE SEQUENCE "${schema}"."${sequence}"`);
      await sql.unsafe(
        `ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${column}" SET DEFAULT nextval('"${schema}"."${sequence}"')`,
      );
      await sql.unsafe(
        `ALTER SEQUENCE "${schema}"."${sequence}" OWNED BY "${schema}"."${table}"."${column}"`,
      );
    }
  }
}

async function addForeignKeys(sql: Sql, options: DbTestHarnessOptions): Promise<void> {
  for (const foreignKey of options.foreignKeys ?? []) {
    await addForeignKey(sql, options.schema, foreignKey);
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
