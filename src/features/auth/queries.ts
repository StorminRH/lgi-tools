import { asc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/db';
import { characters } from './schema';
import type { Character, CharacterRole } from './types';

interface UpsertInput {
  characterId: number;
  name: string;
  portraitUrl: string;
}

// Insert on first login, update name/portrait/lastLoginAt on every subsequent login.
// `role` and `preferences` are deliberately absent from the conflict set: they're
// owned by the admin/preferences UIs once written, and must survive re-logins.
export async function upsertCharacterOnLogin(input: UpsertInput): Promise<Character> {
  const now = new Date();
  const [row] = await db
    .insert(characters)
    .values({
      characterId: input.characterId,
      name: input.name,
      portraitUrl: input.portraitUrl,
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: characters.characterId,
      set: {
        name: input.name,
        portraitUrl: input.portraitUrl,
        lastLoginAt: now,
        updatedAt: now,
      },
    })
    .returning();

  return row as Character;
}

export async function getCharacterById(characterId: number): Promise<Character | null> {
  const [row] = await db
    .select()
    .from(characters)
    .where(eq(characters.characterId, characterId))
    .limit(1);

  return (row as Character | undefined) ?? null;
}

export async function listAdminCharacters(): Promise<Character[]> {
  const rows = await db
    .select()
    .from(characters)
    .where(eq(characters.role, 'ADMIN'))
    .orderBy(asc(characters.name));

  return rows as Character[];
}

// Substring ILIKE search by name. Empty/whitespace-only queries short-circuit
// to [] so the dashboard's empty-q view doesn't fetch the world.
export async function searchCharactersByName(query: string): Promise<Character[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const rows = await db
    .select()
    .from(characters)
    .where(ilike(characters.name, `%${trimmed}%`))
    .orderBy(asc(characters.name));

  return rows as Character[];
}

// Flips a character's role. Returns null when no row matches (i.e. the
// caller passed a characterId that isn't in the table).
export async function setCharacterRole(
  characterId: number,
  role: CharacterRole,
): Promise<Character | null> {
  const [row] = await db
    .update(characters)
    .set({ role, updatedAt: sql`now()` })
    .where(eq(characters.characterId, characterId))
    .returning();

  return (row as Character | undefined) ?? null;
}
