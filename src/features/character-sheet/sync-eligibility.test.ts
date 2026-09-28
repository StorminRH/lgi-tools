import { describe, expect, it } from 'vitest';
import { SHEET_SECTION_KEYS, SHEET_SECTIONS } from './sections';
import { canSyncSection, SHEET_SECTION_SCOPES } from './sync-eligibility';

describe('section sync eligibility', () => {
  it('derives the eligibility scopes from the refresh section table', () => {
    expect(Object.keys(SHEET_SECTION_SCOPES)).toEqual([...SHEET_SECTION_KEYS]);
    for (const key of SHEET_SECTION_KEYS) {
      expect(SHEET_SECTION_SCOPES[key]).toEqual(SHEET_SECTIONS[key].scopes);
    }
  });

  it.each(SHEET_SECTION_KEYS)('requires a token and every required scope for %s', (key) => {
    expect(canSyncSection(key, { hasRefreshToken: false, missingScopes: [] })).toBe(false);
    expect(canSyncSection(key, { hasRefreshToken: true, missingScopes: [] })).toBe(true);
    for (const scope of SHEET_SECTIONS[key].scopes) {
      expect(canSyncSection(key, { hasRefreshToken: true, missingScopes: [scope] })).toBe(false);
    }
    const unrelated = Object.values(SHEET_SECTIONS).flatMap((spec) => [...spec.scopes])
      .filter((scope) => !SHEET_SECTIONS[key].scopes.includes(scope));
    expect(canSyncSection(key, { hasRefreshToken: true, missingScopes: unrelated })).toBe(true);
  });
});
