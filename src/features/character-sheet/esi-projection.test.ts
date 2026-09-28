import { expect, test } from 'vitest';
import {
  parseAttributesBody,
  parseCharacterBody,
  parseClonesBody,
  parseImplantsBody,
  parseCurrentShipBody,
  parseJournalNewestFirst,
  parseOnlineStatusBody,
  parseOrdersBody,
  parseStructureBody,
  parseWalletBody,
} from './esi-projection';

test('projects a character birthday and security status, or null when the body is not a character', () => {
  expect(
    parseCharacterBody({
      birthday: '2014-03-11T09:42:00Z',
      corporation_id: 1000035,
      name: 'Someone',
      security_status: 2.3125,
      race_id: 1,
      bloodline_id: 1,
      gender: 'male',
    }),
  ).toEqual({ birthday: '2014-03-11T09:42:00Z', securityStatus: 2.3125 });
  expect(parseCharacterBody({ birthday: '2014-03-11T09:42:00Z' })).toEqual({
    birthday: '2014-03-11T09:42:00Z',
    securityStatus: null,
  });
  expect(parseCharacterBody({ error: 'not found' })).toBeNull();
});

test('maps the current ship, or null when the body is malformed', () => {
  expect(parseCurrentShipBody({ ship_type_id: 29984, ship_item_id: 1030000000101, ship_name: 'Quiet Ledger' })).toEqual({
    shipTypeId: 29984,
    shipItemId: 1030000000101,
    shipName: 'Quiet Ledger',
  });
  expect(parseCurrentShipBody({ ship_type_id: '29984' })).toBeNull();
});

test('maps online status and drops a body that never says whether the pilot is online', () => {
  expect(parseOnlineStatusBody({ online: true, last_login: '2026-09-27T09:00:00Z', logins: 812 })).toEqual({
    online: true,
    lastLogin: '2026-09-27T09:00:00Z',
    lastLogout: null,
  });
  expect(parseOnlineStatusBody({ last_login: '2026-09-27T09:00:00Z' })).toBeNull();
});

test('maps the five attributes and remap fields, and rejects a body missing an attribute', () => {
  expect(
    parseAttributesBody({
      charisma: 17,
      intelligence: 27,
      memory: 21,
      perception: 17,
      willpower: 17,
      bonus_remaps: 1,
      last_remap_date: '2026-03-11T00:00:00Z',
      accrued_remap_cooldown_date: '2027-03-11T00:00:00Z',
    }),
  ).toEqual({
    intelligence: 27,
    memory: 21,
    perception: 17,
    willpower: 17,
    charisma: 17,
    bonusRemaps: 1,
    lastRemapDate: '2026-03-11T00:00:00Z',
    accruedRemapCooldownDate: '2027-03-11T00:00:00Z',
  });
  expect(
    parseAttributesBody({ charisma: 17, intelligence: 17, memory: 17, perception: 17, willpower: 17 }),
  ).toMatchObject({
    bonusRemaps: 0,
    lastRemapDate: null,
    accruedRemapCooldownDate: null,
  });
  expect(parseAttributesBody({ charisma: 17, intelligence: 17, memory: 17, perception: 17 })).toBeNull();
});

test('sorts implant type ids and rejects a body that is not a list', () => {
  expect(parseImplantsBody([10226, 10217, 10209])).toEqual([10209, 10217, 10226]);
  expect(parseImplantsBody([])).toEqual([]);
  expect(parseImplantsBody({ implants: [] })).toBeNull();
});

test('maps home and jump clones, allows no home, and rejects an unknown location type', () => {
  expect(
    parseClonesBody({
      home_location: { location_id: 60003760, location_type: 'station' },
      jump_clones: [
        {
          jump_clone_id: 41211001,
          location_id: 1099000000001,
          location_type: 'structure',
          implants: [10216, 10208],
          name: 'Trade clone',
        },
        { jump_clone_id: 41211002, location_id: 60008494, location_type: 'station', implants: [] },
      ],
      last_clone_jump_date: '2026-09-18T12:00:00Z',
      last_station_change_date: '2026-01-01T00:00:00Z',
    }),
  ).toEqual({
    home: { locationId: 60003760, locationType: 'station' },
    jumpClones: [
      {
        jumpCloneId: 41211001,
        location: { locationId: 1099000000001, locationType: 'structure' },
        implantTypeIds: [10208, 10216],
        name: 'Trade clone',
      },
      {
        jumpCloneId: 41211002,
        location: { locationId: 60008494, locationType: 'station' },
        implantTypeIds: [],
        name: null,
      },
    ],
    lastCloneJumpDate: '2026-09-18T12:00:00Z',
  });
  expect(parseClonesBody({ jump_clones: [] })).toEqual({ home: null, jumpClones: [], lastCloneJumpDate: null });
  expect(
    parseClonesBody({ jump_clones: [{ jump_clone_id: 1, location_id: 2, location_type: 'planet', implants: [] }] }),
  ).toBeNull();
});

test('accepts the bare wallet number ESI returns and rejects anything else', () => {
  expect(parseWalletBody(3204115882.15)).toBe(3204115882.15);
  expect(parseWalletBody({ balance: 1 })).toBeNull();
  expect(parseWalletBody('1')).toBeNull();
});

test('orders a journal newest first, tolerates rows without amounts, and rejects a non-array', () => {
  const entry = (id: number, date: string) => ({
    id,
    date,
    ref_type: 'bounty_prizes',
    amount: 1,
    balance: 2,
    description: 'x',
  });
  expect(
    parseJournalNewestFirst([
      entry(1, '2026-09-20T00:00:00Z'),
      entry(3, '2026-09-26T00:00:00Z'),
      entry(2, '2026-09-26T00:00:00Z'),
    ])?.map((row) => row.id),
  ).toEqual([3, 2, 1]);
  expect(parseJournalNewestFirst([{ id: 1, date: '2026-09-20T00:00:00Z', ref_type: 'x', description: '' }])).toHaveLength(1);
  expect(parseJournalNewestFirst({ error: 'forbidden' })).toBeNull();
});

test('keeps a structure name and returns null without one', () => {
  expect(parseStructureBody({ name: 'Sobaseki - Driftwood Anchorage', owner_id: 1, solar_system_id: 2 })).toEqual({
    kind: 'named',
    name: 'Sobaseki - Driftwood Anchorage',
  });
  expect(parseStructureBody({ owner_id: 1 })).toBeNull();
});

test('keeps open personal orders, with escrow only on buys, and rejects a malformed body', () => {
  expect(
    parseOrdersBody([
      { order_id: 1, type_id: 34, volume_remain: 1_000_000, volume_total: 2_000_000, is_buy_order: true, is_corporation: false, price: 3.9, escrow: 3_900_000, location_id: 60003760, region_id: 10000002 },
      { order_id: 2, type_id: 29984, volume_remain: 1, volume_total: 1, is_corporation: false, price: 240_000_000, location_id: 60003760, region_id: 10000002 },
      { order_id: 3, type_id: 34, volume_remain: 5, volume_total: 5, is_buy_order: false, is_corporation: true, price: 4, location_id: 60003760, region_id: 10000002 },
    ]),
  ).toEqual({
    open: [
      { typeId: 34, volumeRemain: 1_000_000, isBuyOrder: true, escrow: 3_900_000 },
      { typeId: 29984, volumeRemain: 1, isBuyOrder: false, escrow: 0 },
    ],
  });
  expect(parseOrdersBody([])).toEqual({ open: [] });
  expect(parseOrdersBody({ error: 'forbidden' })).toBeNull();
  expect(parseOrdersBody([{ type_id: 34 }])).toBeNull();
});
