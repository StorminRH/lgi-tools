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
import { syntheticEmail } from '@/platform/auth/synthetic-email';
import { withAdvisoryLock, type ReservedConnection } from './advisory-lock';
import { resolveLockConnectionUrl } from './index';
import { runScript } from './script-runtime';

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

// Links each pre-Better-Auth `characters` row to a new user + account, under
// the caller's held advisory lock. Idempotent — the account is the canonical
// link, so an already-migrated character (prior run or a Better Auth login) is
// skipped.
async function backfillUnderLock(reserved: ReservedConnection): Promise<void> {
  const chars = await reserved<CharacterRow[]>`
    SELECT character_id, name, portrait_url, role, created_at, updated_at FROM characters
  `;

  let created = 0;
  for (const c of chars) {
    const characterId = Number(c.character_id);
    if (!Number.isFinite(characterId)) continue;
    const accountId = String(characterId);

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
}

async function main() {
  const [userTableRow] = await client<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'user'
    ) AS exists
  `;
  if (!userTableRow) throw new Error('user table existence check returned no row');
  if (!userTableRow.exists) {
    console.log('Skipping auth backfill ("user" table missing; migration pending).');
    return;
  }

  const outcome = await withAdvisoryLock(client, LOCK_KEY_NUM, backfillUnderLock);
  if (outcome.busy) {
    console.log('Skipping auth backfill (advisory lock held — another backfill in flight).');
  }
}

// Soft-fail: a failed backfill must not fail the build (per the header).
runScript(main, { client, softFail: true });
