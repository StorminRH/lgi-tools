import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

type Db = ReturnType<typeof drizzle>;

let _db: Db | undefined;

function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _db = drizzle(postgres(url, { prepare: false }));
  return _db;
}

// Proxy preserves the `db.select(...)` call-site API while deferring
// connection until the first actual database call at request time.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
