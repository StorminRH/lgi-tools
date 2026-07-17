import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { readEnv, requireEnv } from '@/lib/env';

type Db = ReturnType<typeof drizzleHttp>;
type HttpClient = ReturnType<typeof neon>;
type Sql = ReturnType<typeof postgres>;

let _client: HttpClient | undefined;
let _db: Db | undefined;
let _directClient: Sql | undefined;

function getClient(): HttpClient {
  if (_client) return _client;
  const url = requireEnv('DATABASE_URL');
  // Neon HTTP driver: one `fetch` per query, no TCP connection held. A Neon
  // compute that has scaled to zero slows the first query instead of erroring
  // it on a dead socket — that's the production-outage fix.
  _client = neon(url);
  return _client;
}

function getDb(): Db {
  if (_db) return _db;
  // Dev-only escape hatch: the neon-http driver speaks HTTP to a Neon SQL
  // endpoint and cannot reach a plain local Postgres, so local `next dev`
  // would 500 every request-path DB read. When LOCAL_DB_DRIVER=postgres-js is
  // set (only ever in a developer's .env.local), build the request client over
  // TCP postgres-js instead — the pre-3.2.1 behaviour, fully compatible since
  // the request path uses no `db.batch`. Production never sets this var, so it
  // always takes the neon-http path below.
  if (readEnv('LOCAL_DB_DRIVER') === 'postgres-js') {
    const url = requireEnv('DATABASE_URL');
    _db = drizzlePg(postgres(url)) as unknown as Db;
    return _db;
  }
  _db = drizzleHttp({ client: getClient() });
  return _db;
}

/**
 * A Neon connection string is "pooled" when its host carries the `-pooler`
 * suffix — that endpoint is PgBouncer in transaction mode, which recycles the
 * underlying backend between statements and so cannot hold a session-scoped
 * advisory lock. Exported for the connection unit test.
 */
export function isPooledHost(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // Don't surface the value — it carries credentials.
    throw new Error('Database connection string is not a valid URL.');
  }
  return hostname.includes('-pooler');
}

/**
 * Resolves the connection string for session-scoped lock holders. Prefers the
 * direct (unpooled) endpoint and falls back to DATABASE_URL — which on local
 * Docker has no `-pooler`, so dev works without the extra var.
 *
 * Fail-closed: if the resolved URL is still a pooled host (unpooled var missing
 * in production), throw rather than silently run a lock that won't hold. The
 * request path never calls this, so this can't affect normal query throughput.
 */
export function resolveLockConnectionUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
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
  // max: 3 — one connection reserved for the advisory lock, headroom for the
  // data ops the lock protects. Direct endpoints have a lower connection
  // ceiling than the pooler and the lock holders (cron/CLI) are infrequent.
  _directClient = postgres(resolveLockConnectionUrl(), { max: 3 });
  return _directClient;
}

/**
 * Proxy preserves the `db.select(...)` call-site API while deferring
 * connection until the first actual database call at request time.
 */
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
