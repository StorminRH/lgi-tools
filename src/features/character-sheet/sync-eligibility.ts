import type { EveScope } from '@/config/eve-scopes';
import { SHEET_SECTION_KEYS, SHEET_SECTIONS } from './sections';
import type { SheetSectionKey } from './types';

function scopesByKey(): Record<SheetSectionKey, readonly EveScope[]> {
  const scopes = {} as Record<SheetSectionKey, readonly EveScope[]>;
  for (const key of SHEET_SECTION_KEYS) scopes[key] = SHEET_SECTIONS[key].scopes;
  return scopes;
}

export const SHEET_SECTION_SCOPES: Record<SheetSectionKey, readonly EveScope[]> = scopesByKey();

export function canSyncSection(
  key: SheetSectionKey,
  character: { hasRefreshToken: boolean; missingScopes: string[] },
): boolean {
  if (!character.hasRefreshToken) return false;
  return !SHEET_SECTION_SCOPES[key].some((scope) => character.missingScopes.includes(scope));
}
