import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export type AnyPgDb = PgDatabase<any, any, any>;

export type PostgresJsDb = PostgresJsDatabase<Record<string, unknown>>;
