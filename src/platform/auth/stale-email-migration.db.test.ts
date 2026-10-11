import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createDbTestHarness,
  seedAccount,
  seedEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import { user } from '@/db/auth-schema';
import { syntheticEmail, unlinkedEmail } from './synthetic-email';

const MIGRATION = 'drizzle/0083_repair_stale_synthetic_emails.sql';
const UNTOUCHED_AT = new Date('2026-01-01T00:00:00.000Z');

const harness = await createDbTestHarness({
  schema: 'test_auth_stale_email_migration',
  tables: ['user', 'account'],
  resetBetweenTests: 'truncate',
});

/** Runs the migration's statements in order inside one transaction, as drizzle's migrator does. */
async function applyMigration(): Promise<void> {
  const statements = readFileSync(MIGRATION, 'utf8').split('--> statement-breakpoint');
  await harness.sql.begin(async (tx) => {
    for (const statement of statements) await tx.unsafe(statement);
  });
}

async function readUsers() {
  const rows = await harness.db.select({ id: user.id, email: user.email, updatedAt: user.updatedAt }).from(user);
  return new Map(rows.map((row) => [row.id, row]));
}

async function link(userId: string, characterId: number, createdAt: string): Promise<void> {
  await seedEveAccount(harness.db, { id: `link-${characterId}`, characterId, userId }, { createdAt: new Date(createdAt) });
}

describe.skipIf(!harness.reachable)('0083 stale synthetic email repair (real Postgres)', () => {
  it('moves every stale email off the character it names and leaves correct users alone', async () => {
    // Correct: the email names a linked character, even though an older link exists.
    await seedUser(harness.db, 'correct', { email: syntheticEmail(201), updatedAt: UNTOUCHED_AT });
    await link('correct', 202, '2026-01-01T00:00:00Z');
    await link('correct', 201, '2026-02-01T00:00:00Z');
    await seedUser(harness.db, 'not-eve', { email: 'pilot@example.test', updatedAt: UNTOUCHED_AT });

    // Stale with a replacement: the oldest parseable link wins over newer links and a malformed older one.
    await seedUser(harness.db, 'replaceable', { email: syntheticEmail(301), updatedAt: UNTOUCHED_AT });
    await seedAccount(harness.db, { id: 'link-malformed-3', accountId: 'not-a-character-3', providerId: 'eve', userId: 'replaceable' }, {
      createdAt: new Date('2025-12-01T00:00:00Z'),
    });
    await link('replaceable', 302, '2026-02-01T00:00:00Z');
    await link('replaceable', 303, '2026-01-01T00:00:00Z');
    // The stale character is now linked to someone else, whose email names another of its characters.
    await seedUser(harness.db, 'new-owner', { email: syntheticEmail(304), updatedAt: UNTOUCHED_AT });
    await link('new-owner', 301, '2026-03-01T00:00:00Z');
    await link('new-owner', 304, '2026-03-02T00:00:00Z');

    // A chain: the replacement is another stale user's email, which phase 1 frees first.
    await seedUser(harness.db, 'blocked', { email: syntheticEmail(401) });
    await link('blocked', 402, '2026-01-01T00:00:00Z');
    await seedUser(harness.db, 'holder', { email: syntheticEmail(402) });
    await link('holder', 403, '2026-01-01T00:00:00Z');

    // A cycle: each stale user's replacement is the other's current email.
    await seedUser(harness.db, 'cycle-a', { email: syntheticEmail(501) });
    await link('cycle-a', 502, '2026-01-01T00:00:00Z');
    await seedUser(harness.db, 'cycle-b', { email: syntheticEmail(502) });
    await link('cycle-b', 501, '2026-01-01T00:00:00Z');

    // Stale with no EVE link, or only a malformed one: parked, never deleted.
    await seedUser(harness.db, 'orphan', { email: syntheticEmail(601), updatedAt: UNTOUCHED_AT });
    await seedUser(harness.db, 'malformed-only', { email: syntheticEmail(701) });
    await seedAccount(harness.db, { id: 'link-malformed-7', accountId: 'not-a-character-7', providerId: 'eve', userId: 'malformed-only' });
    // A stale user whose only parseable link is on another provider keeps the placeholder too.
    await seedUser(harness.db, 'other-provider', { email: syntheticEmail(801) });
    await seedAccount(harness.db, { id: 'link-other-8', accountId: '802', providerId: 'github', userId: 'other-provider' });

    await applyMigration();

    const users = await readUsers();
    expect(Object.fromEntries([...users].map(([id, row]) => [id, row.email]))).toEqual({
      correct: syntheticEmail(201),
      'not-eve': 'pilot@example.test',
      replaceable: syntheticEmail(303),
      'new-owner': syntheticEmail(304),
      blocked: syntheticEmail(402),
      holder: syntheticEmail(403),
      'cycle-a': syntheticEmail(502),
      'cycle-b': syntheticEmail(501),
      orphan: unlinkedEmail('orphan'),
      'malformed-only': unlinkedEmail('malformed-only'),
      'other-provider': unlinkedEmail('other-provider'),
    });
    for (const id of ['correct', 'not-eve', 'new-owner']) {
      expect(users.get(id)?.updatedAt).toEqual(UNTOUCHED_AT);
    }
    for (const id of ['replaceable', 'orphan']) {
      expect(users.get(id)?.updatedAt).not.toEqual(UNTOUCHED_AT);
    }

    await applyMigration();
    expect(await readUsers()).toEqual(users);
  });

  it('is a no-op on empty tables', async () => {
    await applyMigration();
    expect(await readUsers()).toEqual(new Map());
  });
});
