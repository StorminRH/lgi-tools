import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readEnv } from '@/lib/env';
import { resolveMigrationUrl } from './migrate-url';

config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// DDL runs under the schema-owner credential (DATABASE_MIGRATION_URL), falling
// back to DATABASE_URL where the runtime and owner role are still one identity.
const databaseUrl = resolveMigrationUrl();

const client = postgres(databaseUrl, { max: 1 });

async function main() {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  await client.end();
  console.log('Migrations applied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
