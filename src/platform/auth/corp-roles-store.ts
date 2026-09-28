import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { characters, corpMemberRoles } from '@/db/auth-schema';
import type { CorpRolesRecord } from './corp-roles';

export interface StoredCorpRoles extends CorpRolesRecord {
  readonly characterId: number;
  readonly corporationId: number | null;
  readonly fetchedAt: Date;
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
  const result = await db.execute(sql`
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
  return (Array.isArray(result) ? result : result.rows).length > 0;
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
    })
    .from(corpMemberRoles)
    .where(inArray(corpMemberRoles.characterId, [...characterIds]));
  return new Map(rows.map((row) => [row.characterId, row]));
}
