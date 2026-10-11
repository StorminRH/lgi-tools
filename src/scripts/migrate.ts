import './load-env';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readEnv } from '@/lib/env';
import { resolveMigrationUrl } from './migrate-url';
import { createScriptClient, runScript } from './script-runtime';

const databaseUrl = resolveMigrationUrl({
  DATABASE_MIGRATION_URL: readEnv('DATABASE_MIGRATION_URL'),
  DATABASE_URL: readEnv('DATABASE_URL'),
});

const client = createScriptClient(databaseUrl, { max: 1 });

async function main() {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
}

runScript(main, { client });
