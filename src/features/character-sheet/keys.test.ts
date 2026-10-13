import { describe, expect, it } from 'vitest';
import { ownerFixture } from '@/platform/owner-sync/__tests__/owner-fixtures';
import { heldSectionKeys, sectionKeys, sheetDueKeys, sheetEndpointKey, sheetTags } from './keys';
import { SHEET_SECTION_SCOPES } from './sync-eligibility';
import type { SheetSections } from './types';

const holder = { kind: 'character', id: 91 } as const;

describe('sheetTags', () => {
  it('names one tag per tier, so each tier\'s refresh clears the sheet', () => {
    expect(sheetTags(91)).toEqual([
      'eve:character_sheet_live:character:91',
      'eve:character_sheet_hourly:character:91',
      'eve:character_sheet_daily:character:91',
    ]);
  });
});

describe('sectionKeys', () => {
  it('lists every stored answer a direct section is built from', () => {
    expect(sectionKeys(91, 'status')).toEqual([
      { route: '/characters/{character_id}/location/', holder },
      { route: '/characters/{character_id}/ship/', holder },
      { route: '/characters/{character_id}/online/', holder },
    ]);
    expect(sectionKeys(91, 'wallet')).toEqual([sheetEndpointKey(91, 'wallet')]);
  });
});

describe('sheetDueKeys', () => {
  it('lists every eligible direct section\'s answers per character, and nothing for a character without a token', () => {
    const keys = sheetDueKeys([ownerFixture(91), ownerFixture(92, { hasRefreshToken: false })]);
    expect(keys).toContainEqual(sheetEndpointKey(91, 'wallet'));
    expect(keys).toContainEqual(sheetEndpointKey(91, 'location'));
    expect(keys.every((key) => key.holder.kind === 'character' && key.holder.id === 91)).toBe(true);
    expect(keys.some((key) => key.route.includes('structures'))).toBe(false);
    // A missing scope drops only that section.
    const withoutWallet = sheetDueKeys([ownerFixture(91, { missingScopes: [...SHEET_SECTION_SCOPES.wallet] })]);
    expect(withoutWallet).not.toContainEqual(sheetEndpointKey(91, 'wallet'));
    expect(withoutWallet).toContainEqual(sheetEndpointKey(91, 'location'));
  });
});

describe('heldSectionKeys', () => {
  it('keeps the keys of sections holding data, and skips denied and structures sections', () => {
    const sections: SheetSections = {
      wallet: { refreshedAt: '2026-10-12T12:00:00Z', data: { balance: 10 } },
      profile: { refreshedAt: '2026-10-12T12:00:00Z', data: null, denied: true },
      structures: { refreshedAt: '2026-10-12T12:00:00Z', data: { names: {} } },
      status: {
        refreshedAt: '2026-10-12T12:00:00Z',
        data: {
          location: { solarSystemId: 30000142, stationId: null, structureId: null },
          ship: { shipTypeId: 670, shipName: 'Pod', shipItemId: 1 },
          online: { online: true, lastLogin: null, lastLogout: null },
        },
      },
    };
    expect(heldSectionKeys(91, sections)).toEqual([
      ...sectionKeys(91, 'status'),
      sheetEndpointKey(91, 'wallet'),
    ]);
    expect(heldSectionKeys(91, {})).toEqual([]);
  });
});
