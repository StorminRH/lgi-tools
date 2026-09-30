import { describe, expect, it } from 'vitest';
import { createDbTestHarness, seedCharacter } from '@/db/__tests__/support/db-test-harness';
import { readCorpRoles, readRoleCorporationId, upsertCorpRoles } from './corp-roles-store';

const harness = await createDbTestHarness({
  schema: 'test_corp_roles_store',
  tables: ['characters', 'corp_member_roles'],
  foreignKeys: [
    {
      table: 'corp_member_roles',
      column: 'character_id',
      refTable: 'characters',
      refColumn: 'character_id',
      onDelete: 'cascade',
    },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

const CORP = 98000001;
const DIRECTOR = 90001;
const LINE_MEMBER = 90002;

const directorRoles = {
  roles: ['Director', 'Hangar_Take_1'],
  rolesAtHq: ['Hangar_Query_3'],
  rolesAtBase: [],
  rolesAtOther: ['Deliveries_Query'],
};

describe.skipIf(!harness.reachable)('corp roles store against Postgres', () => {
  it('stores the four arrays and captures the corp from characters in the same statement', async () => {
    await seedCharacter(harness.db, DIRECTOR, { corporationId: CORP });
    const fetchedAt = new Date('2026-09-28T10:00:00.000Z');

    await upsertCorpRoles(DIRECTOR, directorRoles, fetchedAt, CORP);

    expect(await readCorpRoles([DIRECTOR, LINE_MEMBER])).toEqual(
      new Map([[DIRECTOR, { characterId: DIRECTOR, corporationId: CORP, ...directorRoles, fetchedAt }]]),
    );
  });

  it('replaces the arrays and the corp on a second fetch', async () => {
    await seedCharacter(harness.db, LINE_MEMBER, { corporationId: CORP });
    await upsertCorpRoles(LINE_MEMBER, directorRoles, new Date('2026-09-28T10:00:00.000Z'), CORP);
    await harness.sql`UPDATE characters SET corporation_id = ${CORP + 1} WHERE character_id = ${LINE_MEMBER}`;
    const later = new Date('2026-09-28T11:00:00.000Z');

    await upsertCorpRoles(LINE_MEMBER, { roles: [], rolesAtHq: [], rolesAtBase: [], rolesAtOther: [] }, later, CORP + 1);

    expect((await readCorpRoles([LINE_MEMBER])).get(LINE_MEMBER)).toEqual({
      characterId: LINE_MEMBER,
      corporationId: CORP + 1,
      roles: [],
      rolesAtHq: [],
      rolesAtBase: [],
      rolesAtOther: [],
      fetchedAt: later,
    });
  });

  it('does not attach an in-flight roles response to a changed corporation', async () => {
    await seedCharacter(harness.db, DIRECTOR, { corporationId: CORP });
    const observed = await readRoleCorporationId(DIRECTOR);
    expect(observed).toBe(CORP);
    await harness.sql`UPDATE characters SET corporation_id = ${CORP + 1} WHERE character_id = ${DIRECTOR}`;

    await expect(upsertCorpRoles(DIRECTOR, directorRoles, new Date(), observed!)).resolves.toBe(false);
    expect(await readCorpRoles([DIRECTOR])).toEqual(new Map());
  });

  it('writes nothing for a character that has no profile row', async () => {
    await upsertCorpRoles(90009, directorRoles, new Date(), CORP);
    expect((await readCorpRoles([90009])).size).toBe(0);
  });
});
