import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readEnv } from '@/lib/env';
import { resolveMigrationUrl } from './migrate-url';
import { runScript } from './script-runtime';

config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// DDL runs under the schema-owner credential (DATABASE_MIGRATION_URL), falling
// back to DATABASE_URL where the runtime and owner role are still one identity.
const databaseUrl = resolveMigrationUrl({
  DATABASE_MIGRATION_URL: readEnv('DATABASE_MIGRATION_URL'),
  DATABASE_URL: readEnv('DATABASE_URL'),
});

const client = postgres(databaseUrl, { max: 1 });

async function main() {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
}

runScript(main, { client });
