// Deploy-time Neon wake immediately before `next build`. Migrate/backfill/
// ingest already touched the database earlier in `build:vercel`, but the
// compile gap before static generation can leave Launch-plan compute suspended
// again. Homepage and site-shell prerender then hit Neon HTTP's 30s bound as
// TimeoutError (not retried on the request path) and fail the whole deploy.
//
// Hard-fail: if Neon cannot answer SELECT 1 here, prerender would fail anyway.
// Retry policy (including TimeoutError) lives in warm-neon-query.ts so the
// shared prerender cold-start envelope stays unchanged.

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
