import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { characters, corpMemberRoles } from '@/db/auth-schema';
import { storedRowJoin } from '@/data/esi-store';
import { esiResponses } from '@/data/esi-store/schema';
import { executeRows } from '@/lib/db-execute';
import type { CorpRolesRecord } from './corp-roles';
import { CHARACTER_ROLES_ROUTE } from './roles-key';

/** A corp_member_roles row with the expiry of the answer it came from; null when the store never recorded one. */
export interface StoredCorpRoles extends CorpRolesRecord {
  readonly characterId: number;
  readonly corporationId: number | null;
  readonly fetchedAt: Date;
  readonly expiresAt: Date | null;
}

export async function readRoleCorporationId(characterId: number): Promise<number | null> {
  const [row] = await db.select({ corporationId: characters.corporationId })
    .from(characters).where(eq(characters.characterId, characterId)).limit(1);
  return row?.corporationId ?? null;
}

export async function upsertCorpRoles(
  characterId: number,
  record: CorpRolesRecord,
  fetchedAt: Date,
  corporationId: number,
): Promise<boolean> {
  const body = JSON.stringify(record);
  const textArray = (key: keyof CorpRolesRecord) =>
    sql`ARRAY(SELECT jsonb_array_elements_text(${body}::jsonb -> ${key}))`;
  const upserted = await executeRows(db, sql`
    WITH observed AS MATERIALIZED (
      SELECT character_id, corporation_id FROM ${characters}
      WHERE character_id = ${characterId} AND corporation_id = ${corporationId}
      FOR SHARE
    )
    INSERT INTO ${corpMemberRoles}
      (character_id, corporation_id, roles, roles_at_hq, roles_at_base, roles_at_other, fetched_at)
    SELECT c.character_id, c.corporation_id,
      ${textArray('roles')}, ${textArray('rolesAtHq')}, ${textArray('rolesAtBase')}, ${textArray('rolesAtOther')},
      ${fetchedAt.toISOString()}::timestamptz
    FROM observed c
    ON CONFLICT (character_id) DO UPDATE SET
      corporation_id = EXCLUDED.corporation_id,
      roles = EXCLUDED.roles,
      roles_at_hq = EXCLUDED.roles_at_hq,
      roles_at_base = EXCLUDED.roles_at_base,
      roles_at_other = EXCLUDED.roles_at_other,
      fetched_at = EXCLUDED.fetched_at
    RETURNING character_id
  `);
  return upserted.length > 0;
}

export async function readCorpRoles(characterIds: readonly number[]): Promise<Map<number, StoredCorpRoles>> {
  if (characterIds.length === 0) return new Map();
  const rows = await db
    .select({
      characterId: corpMemberRoles.characterId,
      corporationId: corpMemberRoles.corporationId,
      roles: corpMemberRoles.roles,
      rolesAtHq: corpMemberRoles.rolesAtHq,
      rolesAtBase: corpMemberRoles.rolesAtBase,
      rolesAtOther: corpMemberRoles.rolesAtOther,
      fetchedAt: corpMemberRoles.fetchedAt,
      expiresAt: esiResponses.expiresAt,
    })
    .from(corpMemberRoles)
    .leftJoin(esiResponses, storedRowJoin(CHARACTER_ROLES_ROUTE, 'character', corpMemberRoles.characterId))
    .where(inArray(corpMemberRoles.characterId, [...characterIds]));
  return new Map(rows.map((row) => [row.characterId, row]));
}
