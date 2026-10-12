import { eq, sql, type SQL } from 'drizzle-orm';
import { getTableConfig, integer, pgTable, PgDialect, text, type PgTable } from 'drizzle-orm/pg-core';
import { expect, test, vi } from 'vitest';
import { characterCacheContributor, userRowsContributor } from './contributors';
import type { MergeTx } from './types';

const skills = pgTable('character_skills', { characterId: integer('character_id') });
const skillSyncs = pgTable('character_skill_syncs', { characterId: integer('character_id') });
const assets = pgTable('owned_assets', { ownerType: text('owner_type'), ownerId: integer('owner_id') });
const plans = pgTable('saved_plans', { id: text('id').primaryKey(), userId: text('user_id') });
const prefs = pgTable('user_preferences', { userId: text('user_id'), key: text('key') });

function recordingDatabase() {
  const dialect = new PgDialect();
  const deletes: { table: string; sql: string; params: unknown[] }[] = [];
  const database = {
    delete: (table: PgTable) => ({
      where: async (predicate: SQL) => {
        const rendered = dialect.sqlToQuery(predicate);
        deletes.push({ table: getTableConfig(table).name, sql: rendered.sql, params: rendered.params });
      },
    }),
  } as unknown as MergeTx;
  return { database, deletes };
}

test('a character cache contributor claims, follows and deletes every listed table in order', async () => {
  const { database, deletes } = recordingDatabase();
  const ownerWhere = vi.fn(
    (ownerId: number) => sql`(${eq(assets.ownerType, 'character')} and ${eq(assets.ownerId, ownerId)})`,
  );
  const contributor = characterCacheContributor(database, {
    name: 'synthetic-cache',
    tables: [
      { table: skills, characterId: skills.characterId },
      { table: assets, where: ownerWhere },
      { table: skillSyncs, characterId: skillSyncs.characterId },
    ],
  });

  expect(contributor).toMatchObject({ name: 'synthetic-cache', tier: 'cache' });
  expect(contributor.claims).toEqual([skills, assets, skillSyncs]);
  expect(contributor.merge).toEqual([
    { table: skills, rule: 'follows-character' },
    { table: assets, rule: 'follows-character' },
    { table: skillSyncs, rule: 'follows-character' },
  ]);
  expect(contributor.purgeUser).toBeUndefined();

  await contributor.purgeCharacter?.({ kind: 'character', userId: 'u1', characterId: 42 });
  expect(ownerWhere).toHaveBeenCalledWith(42);
  expect(deletes).toEqual([
    { table: 'character_skills', sql: '"character_skills"."character_id" = $1', params: [42] },
    {
      table: 'owned_assets',
      sql: '("owned_assets"."owner_type" = $1 and "owned_assets"."owner_id" = $2)',
      params: ['character', 42],
    },
    { table: 'character_skill_syncs', sql: '"character_skill_syncs"."character_id" = $1', params: [42] },
  ]);
});

test('a user rows contributor merges and deletes by the table user_id column', async () => {
  const { database, deletes } = recordingDatabase();
  const rekeyed = userRowsContributor(database, {
    name: 'synthetic-plans',
    table: plans,
    merge: { rule: 'rekey' },
  });
  const survivorWins = userRowsContributor(database, {
    name: 'synthetic-prefs',
    table: prefs,
    merge: { rule: 'survivor-wins', key: [prefs.key] },
  });

  expect(rekeyed).toMatchObject({ name: 'synthetic-plans', tier: 'durable', claims: [plans] });
  expect(rekeyed.merge).toEqual([{ table: plans, rule: 'rekey' }]);
  expect(rekeyed.purgeCharacter).toBeUndefined();
  expect(survivorWins).toMatchObject({ tier: 'durable', claims: [prefs] });
  expect(survivorWins.merge).toEqual([{ table: prefs, rule: 'survivor-wins', key: [prefs.key] }]);

  await rekeyed.purgeUser?.({ kind: 'user', userId: 'u1' });
  await survivorWins.purgeUser?.({ kind: 'user', userId: 'u2' });
  expect(deletes).toEqual([
    { table: 'saved_plans', sql: '"saved_plans"."user_id" = $1', params: ['u1'] },
    { table: 'user_preferences', sql: '"user_preferences"."user_id" = $1', params: ['u2'] },
  ]);
});

test('a user rows contributor refuses a table without a user_id column at load', () => {
  const { database } = recordingDatabase();
  expect(() =>
    userRowsContributor(database, { name: 'synthetic-skills', table: skills, merge: { rule: 'rekey' } }),
  ).toThrow('character_skills has no user_id column');
});
