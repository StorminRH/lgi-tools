import { eq, sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { storedExpiry, untilExpires } from '@/data/esi-store';
import { db } from '@/db';
import { excluded, proposedRowsWhere } from '@/lib/db-upsert';
import type { OwnerWrite } from '@/platform/owner-sync';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import { heldSectionKeys, sheetTags } from './keys';
import { characterSheets } from './schema';
import type { SectionEnvelope, SheetSectionKey, SheetSections } from './types';

/**
 * One character's sheet, cached across instances until the earliest of the
 * answers behind its sections expires. Each tier's sync clears its own tag,
 * so the sheet carries all three.
 */
async function getCharacterSheet(characterId: number): Promise<SheetSections | null> {
  'use cache: remote';
  cacheTag(...sheetTags(characterId));
  const sections = await readSheetRow(characterId);
  cacheLife(untilExpires(await storedExpiry(heldSectionKeys(characterId, sections ?? {}))));
  return sections;
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

/**
 * One section merged into the character's sheet, as a statement the
 * section sync's commit sends with its answers: proposed only where those
 * answers stand, so an older answer merges nothing.
 */
export function mergeSheetSection<K extends SheetSectionKey>(characterId: number, key: K, envelope: SectionEnvelope<K>): OwnerWrite {
  const sections: SheetSections = { [key]: envelope };
  const row = { characterId, sections, lastRefreshedAt: new Date() };
  return {
    kind: 'statements',
    build: (answersStand) => [
      db
        .insert(characterSheets)
        .select(proposedRowsWhere(characterSheets, [row], answersStand))
        .onConflictDoUpdate({
          target: characterSheets.characterId,
          set: {
            sections: sql`${characterSheets.sections} || ${excluded(characterSheets.sections)}`,
            lastRefreshedAt: excluded(characterSheets.lastRefreshedAt),
          },
        }),
    ],
  };
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
}
