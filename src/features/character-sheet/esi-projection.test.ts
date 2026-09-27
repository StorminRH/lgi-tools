import { describe, expect, it } from 'vitest';
import {
  parseAttributesBody,
  parseCharacterBody,
  parseClonesBody,
  parseImplantsBody,
  parseJournalBody,
  parseOnlineBody,
  parseShipBody,
  parseStructureBody,
  parseWalletBody,
} from './esi-projection';

describe('parseCharacterBody', () => {
  it('projects birthday and security status, ignoring the public fields the sheet does not store', () => {
    const body = {
      birthday: '2014-03-11T09:42:00Z',
      corporation_id: 1000035,
      name: 'Someone',
      security_status: 2.3125,
      race_id: 1,
      bloodline_id: 1,
      gender: 'male',
    };
    expect(parseCharacterBody(body)).toEqual({ birthday: '2014-03-11T09:42:00Z', securityStatus: 2.3125 });
  });

  it('keeps a missing security status as null instead of inventing zero', () => {
    expect(parseCharacterBody({ birthday: '2014-03-11T09:42:00Z' })).toEqual({
      birthday: '2014-03-11T09:42:00Z',
      securityStatus: null,
    });
  });

  it('returns null when the body is not a character', () => {
    expect(parseCharacterBody({ error: 'not found' })).toBeNull();
  });
});

describe('parseShipBody', () => {
  it('maps the ship fields', () => {
    expect(parseShipBody({ ship_type_id: 29984, ship_item_id: 1030000000101, ship_name: 'Quiet Ledger' })).toEqual({
      shipTypeId: 29984,
      shipItemId: 1030000000101,
      shipName: 'Quiet Ledger',
    });
  });

  it('returns null on a malformed body', () => {
    expect(parseShipBody({ ship_type_id: '29984' })).toBeNull();
  });
});

describe('parseOnlineBody', () => {
  it('maps the online flag and optional timestamps', () => {
    expect(parseOnlineBody({ online: true, last_login: '2026-09-27T09:00:00Z', logins: 812 })).toEqual({
      online: true,
      lastLogin: '2026-09-27T09:00:00Z',
      lastLogout: null,
    });
  });

  it('returns null when online is missing', () => {
    expect(parseOnlineBody({ last_login: '2026-09-27T09:00:00Z' })).toBeNull();
  });
});

describe('parseAttributesBody', () => {
  it('maps the five attributes and the remap fields', () => {
    const body = {
      charisma: 17,
      intelligence: 27,
      memory: 21,
      perception: 17,
      willpower: 17,
      bonus_remaps: 1,
      last_remap_date: '2026-03-11T00:00:00Z',
      accrued_remap_cooldown_date: '2027-03-11T00:00:00Z',
    };
    expect(parseAttributesBody(body)).toEqual({
      intelligence: 27,
      memory: 21,
      perception: 17,
      willpower: 17,
      charisma: 17,
      bonusRemaps: 1,
      lastRemapDate: '2026-03-11T00:00:00Z',
      accruedRemapCooldownDate: '2027-03-11T00:00:00Z',
    });
  });

  it('defaults absent remap fields to zero remaps and null dates', () => {
    const body = { charisma: 17, intelligence: 17, memory: 17, perception: 17, willpower: 17 };
    expect(parseAttributesBody(body)).toMatchObject({
      bonusRemaps: 0,
      lastRemapDate: null,
      accruedRemapCooldownDate: null,
    });
  });

  it('returns null when an attribute is missing', () => {
    expect(parseAttributesBody({ charisma: 17, intelligence: 17, memory: 17, perception: 17 })).toBeNull();
  });
});

describe('parseImplantsBody', () => {
  it('sorts the type ids so the stored part is order-stable', () => {
    expect(parseImplantsBody([10226, 10217, 10209])).toEqual([10209, 10217, 10226]);
  });

  it('accepts an empty set and rejects a non-array', () => {
    expect(parseImplantsBody([])).toEqual([]);
    expect(parseImplantsBody({ implants: [] })).toBeNull();
  });
});

describe('parseClonesBody', () => {
  it('maps home, jump clones and the last jump date', () => {
    const body = {
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
    };
    expect(parseClonesBody(body)).toEqual({
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
  });

  it('allows a character with no home set', () => {
    expect(parseClonesBody({ jump_clones: [] })).toEqual({ home: null, jumpClones: [], lastCloneJumpDate: null });
  });

  it('rejects an unknown location type', () => {
    expect(
      parseClonesBody({ jump_clones: [{ jump_clone_id: 1, location_id: 2, location_type: 'planet', implants: [] }] }),
    ).toBeNull();
  });
});

describe('parseWalletBody', () => {
  it('accepts the bare number ESI returns', () => {
    expect(parseWalletBody(3204115882.15)).toBe(3204115882.15);
  });

  it('rejects anything else', () => {
    expect(parseWalletBody({ balance: 1 })).toBeNull();
    expect(parseWalletBody('1')).toBeNull();
  });
});

describe('parseJournalBody', () => {
  const entry = (id: number, date: string) => ({
    id,
    date,
    ref_type: 'bounty_prizes',
    amount: 1,
    balance: 2,
    description: 'x',
  });

  it('orders newest first and breaks date ties by id', () => {
    const body = [
      entry(1, '2026-09-20T00:00:00Z'),
      entry(3, '2026-09-26T00:00:00Z'),
      entry(2, '2026-09-26T00:00:00Z'),
    ];
    expect(parseJournalBody(body)?.map((row) => row.id)).toEqual([3, 2, 1]);
  });

  it('tolerates entries without amount or balance', () => {
    expect(parseJournalBody([{ id: 1, date: '2026-09-20T00:00:00Z', ref_type: 'x', description: '' }])).toHaveLength(1);
  });

  it('returns null on a non-array body', () => {
    expect(parseJournalBody({ error: 'forbidden' })).toBeNull();
  });
});

describe('parseStructureBody', () => {
  it('keeps only the name', () => {
    expect(parseStructureBody({ name: 'Sobaseki - Driftwood Anchorage', owner_id: 1, solar_system_id: 2 })).toEqual({
      name: 'Sobaseki - Driftwood Anchorage',
    });
  });

  it('returns null without a name', () => {
    expect(parseStructureBody({ owner_id: 1 })).toBeNull();
  });
});
