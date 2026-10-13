import { neon, neonConfig } from '@neondatabase/serverless';
import type { Query, SQL } from 'drizzle-orm';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { timeDependency } from '@/lib/dependency-timing';
import { readEnv, requireEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { retrySerializationFailures } from './serialization-retry';
import { withQueryTiming } from './timed-postgres';

export type Db = ReturnType<typeof drizzleHttp>;
type HttpClient = ReturnType<typeof neon>;

/** Owned alias for the postgres-js client handle; downstream modules type against this, never the vendor package. */
export type Sql = ReturnType<typeof postgres>;

export type ReservedConnection = Awaited<ReturnType<Sql['reserve']>>;

const NEON_HTTP_TIMEOUT_MS = 30_000;

export const PG_CONNECT_TIMEOUT_SECONDS = 30;

function timedPostgres(url: string, options: Parameters<typeof postgres>[1]): Sql {
  return withQueryTiming(postgres(url, options));
}

let _client: HttpClient | undefined;
let _db: Db | undefined;
let _directClient: Sql | undefined;
let _deletionClient: Sql | undefined;

function getClient(): HttpClient {
  if (_client) return _client;
  const url = requireEnv('DATABASE_URL');
  neonConfig.fetchFunction = (input: string | URL, init?: RequestInit) =>
    timeDependency('neon', () => fetchWithTimeout(input, init, NEON_HTTP_TIMEOUT_MS));
  _client = neon(url);
  return _client;
}

function getDb(): Db {
  if (_db) return _db;
  if (readEnv('LOCAL_DB_DRIVER') === 'postgres-js') {
    const url = requireEnv('DATABASE_URL');
    _db = drizzlePg(
      timedPostgres(url, { connect_timeout: PG_CONNECT_TIMEOUT_SECONDS }),
    ) as unknown as Db;
    return _db;
  }
  _db = drizzleHttp({ client: getClient() });
  return _db;
}

export function isPooledHost(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error('Database connection string is not a valid URL.');
  }
  return hostname.includes('-pooler');
}

export function resolveLockConnectionUrl(): string {
  const url =
    readEnv('LGI_DATABASE_URL_UNPOOLED') ??
    readEnv('LGI_DATABASE_URL') ??
    readEnv('DATABASE_URL_UNPOOLED') ??
    readEnv('DATABASE_URL');
  if (!url) throw new Error('DATABASE_URL is not set');
  if (isPooledHost(url)) {
    throw new Error(
      'Refusing to hold a session advisory lock on a pooled (-pooler) connection: ' +
        'set DATABASE_URL_UNPOOLED to the direct Neon endpoint. ' +
        'Session-scoped locks do not hold through PgBouncer transaction-mode pooling.',
    );
  }
  return url;
}

function getDirectClient(): Sql {
  if (_directClient) return _directClient;
  _directClient = timedPostgres(resolveLockConnectionUrl(), {
    max: 3,
    connect_timeout: PG_CONNECT_TIMEOUT_SECONDS,
  });
  return _directClient;
}

/** Deletion jobs must not occupy the pool used by their nested projection work. */
export function getDeletionClient(): Sql {
  _deletionClient ??= timedPostgres(resolveLockConnectionUrl(), {
    max: 1,
    connect_timeout: PG_CONNECT_TIMEOUT_SECONDS,
  });
  return _deletionClient;
}

const dialect = new PgDialect();

/**
 * Runs one statement alone in a serializable transaction. Nothing waits on a
 * lock: when a concurrent write conflicts with what the statement read,
 * Postgres rejects it with a serialization failure, and the statement runs
 * again here in a fresh transaction (see retrySerializationFailures). That is
 * safe because a rejected transaction left nothing behind, so callers never
 * retry it themselves. Over Neon's HTTP driver each attempt is a single request.
 */
export async function runSerializable(query: SQL): Promise<Record<string, unknown>[]> {
  const statement = dialect.sqlToQuery(query);
  const [rows = []] = await retrySerializationFailures(() => runSerializableOnce([statement]));
  return rows;
}

/**
 * Runs built statements (Drizzle inserts, updates and deletes, rendered by
 * their own `toSQL()`) in order as one atomic, non-interactive serializable
 * transaction, and hands back each statement's rows in the same order. No
 * statement can read another's result, so a later statement that depends on
 * an earlier one says so in its own SQL (an EXISTS guard on what the earlier
 * one wrote). Any failure rolls every statement back; a serialization
 * failure reruns the whole list in a fresh transaction, as runSerializable
 * does. Over Neon's HTTP driver each attempt is one request; locally it is
 * one postgres-js transaction on the request client.
 */
export function runAtomically(statements: readonly { toSQL(): Query }[]): Promise<Record<string, unknown>[][]> {
  const queries = statements.map((statement) => statement.toSQL());
  return retrySerializationFailures(() => runSerializableOnce(queries));
}

async function runSerializableOnce(queries: readonly Query[]): Promise<Record<string, unknown>[][]> {
  if (readEnv('LOCAL_DB_DRIVER') === 'postgres-js') {
    const client = (getDb() as unknown as { $client: Sql }).$client;
    const results = await client.begin('isolation level serializable', async (tx) => {
      const rows: unknown[] = [];
      for (const { sql: text, params } of queries) rows.push(await tx.unsafe(text, params as never[]));
      return rows;
    });
    return results as Record<string, unknown>[][];
  }
  return getClient().transaction<false, false>((tx) => queries.map(({ sql: text, params }) => tx.query(text, params)), {
    isolationLevel: 'Serializable',
  });
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/**
 * Raw postgres-js client on the direct (unpooled) endpoint. Only lock holders
 * need it: they reserve a connection to hold a session-level advisory lock
 * across a non-transactional HTTP call, which requires a stable backend — so it
 * must NOT run through the pooler. Request-path code uses `db` above instead.
 */
export const directClient: Sql = new Proxy({} as Sql, {
  get(_target, prop) {
    return (getDirectClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
