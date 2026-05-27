import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

type Db = ReturnType<typeof drizzle>;
type Sql = ReturnType<typeof postgres>;

let _client: Sql | undefined;
let _db: Db | undefined;

function getClient(): Sql {
  if (_client) return _client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _client = postgres(url, { prepare: false });
  return _client;
}

function getDb(): Db {
  if (_db) return _db;
  _db = drizzle(getClient());
  return _db;
}

// Proxy preserves the `db.select(...)` call-site API while deferring
// connection until the first actual database call at request time.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// Same lazy contract for the raw postgres-js client. Only needed by callers
// that have to bypass Drizzle's ORM layer — currently just the price-refresh
// path, which reserves a connection from the pool to hold a session-level
// advisory lock across a non-transactional HTTP call.
export const client: Sql = new Proxy({} as Sql, {
  get(_target, prop) {
    return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
