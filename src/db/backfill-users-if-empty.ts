// Deploy-time auth backfill (3.4.1a). Runs on every `pnpm vercel-build`, after
// migrate. For each existing `characters` row it creates the Better Auth `user`
// + `account` link the new auth model needs, so pilots who signed up under the
// old custom auth keep their access (admin role copied up to the user).
//
// Idempotent: keyed on the account (the canonical user↔character link), so a
// re-run — or a pilot who logged in via Better Auth between deploys — is a
// no-op. Runs on every forked preview Neon branch too (fresh branch → no
// characters → no-op; populated branch → backfills once).
//
// Reversible: drops only into the new tables; `characters`/`usage_logs` are
// untouched, so rolling back is just dropping the four Better Auth tables.
//
// Failures are SOFT — the build continues. (Same posture as ingest-sde-if-empty.)

import { config } from 'dotenv';
import { readEnv } from '@/lib/env';
config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

import postgres from 'postgres';
import { syntheticEmail } from '../features/auth/synthetic-email';
import { resolveLockConnectionUrl } from './index';

if (!readEnv('DATABASE_URL')) {
  console.log('Skipping auth backfill (DATABASE_URL is not set).');
  process.exit(0);
}

// Direct (unpooled) endpoint — the advisory lock is session-scoped and won't
// hold through the `-pooler` endpoint. Resolved here so the fail-closed throw
// soft-skips rather than failing the build.
let lockUrl: string;
try {
  lockUrl = resolveLockConnectionUrl();
} catch (err) {
  console.error('Skipping auth backfill (build continues):', err);
  process.exit(0);
}

const client = postgres(lockUrl, { max: 2 });
// Distinct from the SDE ingest lock (8273619013) — guards against two preview
// builds racing the same branch DB. Session-scoped; released in finally.
const LOCK_KEY_NUM = 8419273051;

interface CharacterRow {
  character_id: string;
  name: string;
  portrait_url: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

async function main() {
  const reserved = await client.reserve();
  let lockHeld = false;
  try {
    const tableCheck = await reserved<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'user'
      ) AS exists
    `;
    if (!tableCheck[0].exists) {
      console.log('Skipping auth backfill ("user" table missing; migration pending).');
      return;
    }

    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY_NUM}) AS got
    `;
    if (!lockResult[0].got) {
      console.log('Skipping auth backfill (advisory lock held — another backfill in flight).');
      return;
    }
    lockHeld = true;

    const chars = await reserved<CharacterRow[]>`
      SELECT character_id, name, portrait_url, role, created_at, updated_at FROM characters
    `;

    let created = 0;
    for (const c of chars) {
      const characterId = Number(c.character_id);
      if (!Number.isFinite(characterId)) continue;
      const accountId = String(characterId);

      // The account is the canonical link — its presence means this character is
      // already migrated (by a prior run or by a Better Auth login). Skip.
      const existing = await reserved`
        SELECT 1 FROM account WHERE provider_id = 'eve' AND account_id = ${accountId} LIMIT 1
      `;
      if (existing.length > 0) continue;

      const userId = `eve-user-${characterId}`;
      // Deterministic ids + ON CONFLICT DO NOTHING make a crash between the two
      // inserts self-healing on re-run (user already there → account follows).
      await reserved`
        INSERT INTO "user" (id, name, email, email_verified, image, role, created_at, updated_at)
        VALUES (
          ${userId}, ${c.name}, ${syntheticEmail(characterId)}, true,
          ${c.portrait_url}, ${c.role}, ${c.created_at}, ${c.updated_at}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      await reserved`
        INSERT INTO account (id, account_id, provider_id, user_id, scope, created_at, updated_at)
        VALUES (${`eve-acct-${characterId}`}, ${accountId}, 'eve', ${userId}, 'publicData', now(), now())
        ON CONFLICT (id) DO NOTHING
      `;
      created++;
    }

    console.log(
      `Auth backfill complete: linked ${created} new user/account pair(s) (from ${chars.length} character row(s)).`,
    );
  } finally {
    if (lockHeld) {
      await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
    }
    reserved.release();
  }
}

main()
  .then(async () => {
    await client.end();
    process.exit(0);
  })
  .catch(async (err) => {
    // Soft failure: log, close cleanly, exit 0. The build continues.
    console.error('Auth backfill failed (build continues):', err);
    await client.end().catch(() => undefined);
    process.exit(0);
  });
