// One-shot SDE ingest used by vercel-build. Skips when the dgm_type_attributes
// table already has rows, so it only does the 14-second Fuzzwork download +
// 600k-row insert on the first deploy to a fresh DB branch (a brand-new
// preview branch, or the production branch after the 2.7.1 migration first
// lands). Subsequent builds on the same branch find a populated table and
// no-op.
//
// Ingest failures are logged but do NOT fail the build — the rest of the app
// keeps working; per-NPC combat stats degrade to nulls until SDE is populated
// (either by a successful subsequent build or by running pnpm db:ingest:sde
// manually).

import { config } from 'dotenv';
config({ path: process.env.DOTENV_PATH ?? '.env.local' });

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { runIngest } from '../data/eve-data/ingest';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log('Skipping SDE auto-ingest (DATABASE_URL is not set).');
  process.exit(0);
}

const client = postgres(databaseUrl, { max: 1 });

async function main() {
  const db = drizzle(client);

  // The table only exists post-migration. If it doesn't exist yet (e.g. the
  // migration step that creates it is skipped on a local build), treat that
  // as "nothing to do" and exit clean.
  const [{ exists }] = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'dgm_type_attributes'
    ) AS exists
  `);
  if (!exists) {
    console.log('Skipping SDE auto-ingest (dgm_type_attributes does not exist).');
    return;
  }

  const [{ count }] = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count FROM dgm_type_attributes
  `);
  if (Number(count) > 0) {
    console.log(`Skipping SDE auto-ingest (dgm_type_attributes already has ${count} rows).`);
    return;
  }

  console.log('Auto-ingesting SDE (dgm_type_attributes is empty)…');
  const summary = await runIngest(db);
  console.log('SDE auto-ingest complete.');
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(async () => {
    await client.end();
    process.exit(0);
  })
  .catch(async (err) => {
    // Soft failure: log, close cleanly, exit 0. The build continues.
    console.error('SDE auto-ingest failed (build continues):', err);
    await client.end().catch(() => undefined);
    process.exit(0);
  });
