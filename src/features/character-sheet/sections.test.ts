import { describe, expect, it } from 'vitest';
import { ATTRIBUTE_KEYS, ATTRIBUTE_BONUS_DOGMA_NAMES } from '@/data/eve-data/character-attributes';
import { LOCATION_SYNC_SCOPES } from '@/data/location-tracking/sync-eligibility';
import { ESI_DATASET_ENTRIES } from '@/lib/esi-datasets/entries';
import { effectiveTtlMs } from '@/lib/esi-datasets/types';
import { EVE_SCOPES } from '@/platform/auth/eve-sso-constants';
import { SHEET_SECTION_KEYS, SHEET_SECTIONS, TIER_ENTRY } from './sections';

describe('SHEET_SECTIONS', () => {
  it('covers the table once and routes every section to a registered sheet refresh tier', () => {
    expect(Object.keys(SHEET_SECTIONS)).toEqual([...SHEET_SECTION_KEYS]);
    expect(new Set(SHEET_SECTION_KEYS).size).toBe(SHEET_SECTION_KEYS.length);
    for (const key of SHEET_SECTION_KEYS) {
      const spec = SHEET_SECTIONS[key];
      expect(spec.key).toBe(key);
      const entry = ESI_DATASET_ENTRIES.find((candidate) => candidate.name === TIER_ENTRY[spec.tier]);
      expect(entry?.refreshOwner).toEqual({ kind: 'deferred-queue', dataset: 'character_sheet' });
      expect(entry?.mirrorTables).toContain('character_sheets');
    }
  });

  it('requests every required scope at sign-in and shares tracking and wallet authorization', () => {
    for (const spec of Object.values(SHEET_SECTIONS)) {
      for (const scope of spec.scopes) expect(EVE_SCOPES).toContain(scope);
    }
    expect(SHEET_SECTIONS.status.scopes).toEqual(LOCATION_SYNC_SCOPES);
    expect(SHEET_SECTIONS.wallet.scopes).toEqual(SHEET_SECTIONS.journal.scopes);
    expect(SHEET_SECTIONS.profile.scopes).toHaveLength(0);
  });

  it('keeps rapidly changing sections fresher than journal history and public profile', () => {
    const ttl = (key: keyof typeof SHEET_SECTIONS) => {
      const entry = ESI_DATASET_ENTRIES.find((candidate) => candidate.name === TIER_ENTRY[SHEET_SECTIONS[key].tier]);
      return effectiveTtlMs(entry!);
    };
    expect(ttl('status')).toBe(ttl('wallet'));
    expect(ttl('wallet')).toBeLessThan(ttl('journal')!);
    expect(ttl('journal')).toBeLessThan(ttl('profile')!);
  });

  it('parses wallet and attribute payloads through the table used by refresh', () => {
    expect(SHEET_SECTIONS.wallet.parts.balance.parse(12.5, new Date())).toBe(12.5);
    expect(SHEET_SECTIONS.wallet.parts.balance.parse('12.5', new Date())).toBeNull();
    const attributes = Object.fromEntries(ATTRIBUTE_KEYS.map((key, index) => [key, 20 + index]));
    const parsed = SHEET_SECTIONS.attributes.parts.attributes.parse(attributes, new Date());
    expect(parsed).toMatchObject(attributes);
    expect(Object.keys(ATTRIBUTE_BONUS_DOGMA_NAMES).sort()).toEqual([...ATTRIBUTE_KEYS].sort());
  });
});
