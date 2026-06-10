import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readEnv, requireEnv } from '@/lib/env';

config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl = requireEnv('DATABASE_URL');

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
