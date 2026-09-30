import { drizzle } from 'drizzle-orm/postgres-js';
import { getDeletionClient } from './index';

let database: ReturnType<typeof drizzle> | undefined;

/** Separate from the direct pool needed by projection work inside a deletion. */
export function deletionDatabase() {
  database ??= drizzle(getDeletionClient());
  return database;
}
