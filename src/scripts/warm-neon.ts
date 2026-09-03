import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { readEnv, requireEnv } from '@/lib/env';

config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

import { db } from '@/db';
import { warmNeon } from './warm-neon-query';

requireEnv('DATABASE_URL');

async function main(): Promise<void> {
  await warmNeon(() => db.execute(sql`SELECT 1`));
  console.log('Neon warm complete.');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
