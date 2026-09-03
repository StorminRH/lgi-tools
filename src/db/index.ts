import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { addDependencyTiming } from '@/lib/dependency-timing';
import { readEnv, requireEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
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

function getClient(): HttpClient {
  if (_client) return _client;
  const url = requireEnv('DATABASE_URL');

  neonConfig.fetchFunction = async (input: string | URL, init?: RequestInit) => {
    const startedAt = performance.now();
    try {
      return await fetchWithTimeout(input, init, NEON_HTTP_TIMEOUT_MS);
    } finally {
      addDependencyTiming('neon', performance.now() - startedAt);
    }
  };

  _client = neon(url);
  return _client;
}

function getDb(): Db {
  if (_db) return _db;

  // endpoint and cannot reach a plain local Postgres, so local `next dev`

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
