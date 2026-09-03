import { config } from 'dotenv';
import { readEnv } from '@/lib/env';
config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

import { syntheticEmail } from '@/platform/auth/synthetic-email';
import { withAdvisoryLock, type ReservedConnection } from '@/db/advisory-lock';
import { requireSoftFailLockClient, runScript } from './script-runtime';

const client = requireSoftFailLockClient(
  'Skipping auth backfill (DATABASE_URL is not set).',
  'Skipping auth backfill (build continues):',
);
const LOCK_KEY_NUM = 8419273051;

interface CharacterRow {
  character_id: string;
  name: string;
  portrait_url: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

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

runScript(main, { client, softFail: true });
