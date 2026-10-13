import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDb } from '@/lib/db-types';
import { directClient } from './index';

let database: PostgresJsDb | undefined;

/**
 * Drizzle over the direct (unpooled) client, for interactive transactions and
 * row locks that the HTTP `db` cannot hold. The first call validates the
 * endpoint and refuses a pooled (-pooler) URL.
 */
export function directDatabase(): PostgresJsDb {
  database ??= drizzle(directClient);
  return database;
}
