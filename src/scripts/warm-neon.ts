import './load-env';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireEnv } from '@/lib/env';
import { runScript } from './script-runtime';
import { warmNeon } from './warm-neon-query';

requireEnv('DATABASE_URL');

async function main(): Promise<void> {
  await warmNeon(() => db.execute(sql`SELECT 1`));
  console.log('Neon warm complete.');
}

runScript(main);
