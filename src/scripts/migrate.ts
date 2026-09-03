import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readEnv } from '@/lib/env';
import { resolveMigrationUrl } from './migrate-url';
import { runScript } from './script-runtime';

config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { PG_CONNECT_TIMEOUT_SECONDS } from '@/db';

const databaseUrl = resolveMigrationUrl({
  DATABASE_MIGRATION_URL: readEnv('DATABASE_MIGRATION_URL'),
  DATABASE_URL: readEnv('DATABASE_URL'),
});

const client = postgres(databaseUrl, { max: 1, connect_timeout: PG_CONNECT_TIMEOUT_SECONDS });

async function main() {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
}

runScript(main, { client });
