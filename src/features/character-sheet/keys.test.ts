import { describe, expect, it } from 'vitest';
import { heldSectionKeys, sectionKeys, sheetEndpointKey, sheetTags } from './keys';
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
