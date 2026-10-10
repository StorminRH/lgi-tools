import type { SQL } from 'drizzle-orm';
import type { AnyPgDb } from './db-types';

/**
 * The rows of a raw `database.execute` on either driver. postgres-js (the direct
 * client, and `db` when `LOCAL_DB_DRIVER=postgres-js`) resolves to a row array;
 * neon-http (the production pooled `db`) resolves to `{ rows }`. The static type
 * of `db` is the neon-http one in both cases, so branch on the runtime shape.
 */
export async function executeRows<T extends Record<string, unknown>>(
  database: AnyPgDb,
  query: SQL,
): Promise<T[]> {
  const result = await database.execute<T>(query);
  return Array.isArray(result) ? result : result.rows;
}
