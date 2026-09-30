import { describe, expect, it } from 'vitest';
import { SHEET_SECTION_KEYS, SHEET_SECTIONS } from './sections';
import { canSyncSection } from './sync-eligibility';

describe('section sync eligibility', () => {
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
