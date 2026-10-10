import { eq, sql } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import { excluded } from '@/lib/db-upsert';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import { characterSheets } from './schema';
import type { SectionEnvelope, SheetSectionKey, SheetSections } from './types';

export function sheetTag(characterId: number): string {
  return `character-sheet:${characterId}`;
}

async function getCharacterSheet(characterId: number): Promise<SheetSections | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(sheetTag(characterId));
  return readSheetRow(characterId);
}

export async function getCharacterSheets(characterIds: number[]): Promise<Map<number, SheetSections>> {
  return mapByIdDroppingNulls(characterIds, getCharacterSheet);
}

export async function readSheetRow(characterId: number): Promise<SheetSections | null> {
  const rows = await db
    .select({ sections: characterSheets.sections })
    .from(characterSheets)
    .where(eq(characterSheets.characterId, characterId))
    .limit(1);
  return rows[0]?.sections ?? null;
}

export async function mergeSheetSection<K extends SheetSectionKey>(
  characterId: number,
  key: K,
  envelope: SectionEnvelope<K>,
): Promise<void> {
  const now = new Date();
  const sections: SheetSections = { [key]: envelope };
  await db
    .insert(characterSheets)
    .values({ characterId, sections, lastRefreshedAt: now })
    .onConflictDoUpdate({
      target: characterSheets.characterId,
      set: {
        sections: sql`${characterSheets.sections} || ${excluded(characterSheets.sections)}`,
        lastRefreshedAt: now,
      },
    });
  revalidateTag(sheetTag(characterId), 'max');
}

export async function stampSheetSection(characterId: number, key: SheetSectionKey): Promise<void> {
  const now = new Date();
  await db
    .update(characterSheets)
    .set({
      sections: sql`jsonb_set(${characterSheets.sections}, ARRAY[${key}::text, 'refreshedAt'], to_jsonb(${now.toISOString()}::text))`,
      lastRefreshedAt: now,
    })
    .where(sql`${characterSheets.characterId} = ${characterId} AND ${characterSheets.sections} ? ${key}`);
  revalidateTag(sheetTag(characterId), 'max');
}
