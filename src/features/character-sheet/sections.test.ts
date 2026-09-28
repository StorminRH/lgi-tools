import { expect, test } from 'vitest';
import { SHEET_SECTION_KEYS, SHEET_SECTIONS, TIER_ENTRY } from './sections';

test('the sheet table wires board order, tier, scopes, and one ESI endpoint per part', () => {
  expect([...SHEET_SECTION_KEYS]).toEqual([
    'profile',
    'status',
    'attributes',
    'implants',
    'clones',
    'wallet',
    'journal',
    'orders',
    'structures',
  ]);
  expect(Object.keys(SHEET_SECTIONS)).toEqual([...SHEET_SECTION_KEYS]);
  expect(Object.fromEntries(SHEET_SECTION_KEYS.map((key) => [key, SHEET_SECTIONS[key].tier]))).toEqual({
    profile: 'daily',
    status: 'live',
    attributes: 'live',
    implants: 'live',
    clones: 'live',
    wallet: 'live',
    journal: 'hourly',
    orders: 'hourly',
    structures: 'hourly',
  });
  expect(Object.fromEntries(SHEET_SECTION_KEYS.map((key) => [key, [...SHEET_SECTIONS[key].scopes]]))).toEqual({
    profile: [],
    status: ['esi-location.read_location.v1', 'esi-location.read_ship_type.v1', 'esi-location.read_online.v1'],
    attributes: ['esi-skills.read_skills.v1'],
    implants: ['esi-clones.read_implants.v1'],
    clones: ['esi-clones.read_clones.v1'],
    wallet: ['esi-wallet.read_character_wallet.v1'],
    journal: ['esi-wallet.read_character_wallet.v1'],
    orders: ['esi-markets.read_character_orders.v1'],
    structures: ['esi-universe.read_structures.v1'],
  });

  const endpoints: Record<string, Record<string, string>> = {};
  for (const key of SHEET_SECTION_KEYS) {
    const spec = SHEET_SECTIONS[key];
    if (spec.parts === 'structures') continue;
    endpoints[key] = Object.fromEntries(
      Object.entries(spec.parts).map(([part, partSpec]) => [part, partSpec.endpoint]),
    );
  }
  expect(endpoints).toEqual({
    profile: { character: 'character' },
    status: { location: 'location', ship: 'ship', online: 'online' },
    attributes: { attributes: 'attributes' },
    implants: { implants: 'implants' },
    clones: { clones: 'clones' },
    wallet: { balance: 'wallet' },
    journal: { journal: 'journal' },
    orders: { orders: 'orders' },
  });
  expect(SHEET_SECTIONS.structures.parts).toBe('structures');
  expect(SHEET_SECTIONS.wallet.parts.balance.parse(12.5, new Date())).toBe(12.5);
  expect(SHEET_SECTIONS.wallet.parts.balance.parse('12.5', new Date())).toBeNull();
  expect(TIER_ENTRY).toEqual({
    live: 'character_sheet_live',
    hourly: 'character_sheet_hourly',
    daily: 'character_sheet_daily',
  });
});
