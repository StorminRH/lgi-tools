import { CHARACTER_ROLES, type CharacterRole } from '@/config/character-roles';
import { readEnv } from '@/lib/env';

/** The configured superadmin character, or null when unset, not a whole number or not positive. */
export function superadminCharacterId(): number | null {
  const id = Number(readEnv('SUPERADMIN_CHARACTER_ID'));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** An ADMIN role, or the env superadmin as the active character, grants admin. */
export function isAdminIdentity(characterId: number | null, role: CharacterRole): boolean {
  if (role === 'ADMIN') return true;
  return characterId !== null && characterId === superadminCharacterId();
}

/** Unknown or missing role values read as USER. */
export function normalizeCharacterRole(raw: unknown): CharacterRole {
  return CHARACTER_ROLES.find((role) => role === raw) ?? 'USER';
}
