import { describe, expect, it } from 'vitest';
import { blankDoor, blankHallway, hallwayDoorTypes, identityFromDoors } from './connection-hallway';
import {
  applyDoorType,
  applyReturnDoorType,
  connectionTypePatch,
  isEntranceType,
  returnDoorTypePatch,
  typedDoorsFrom,
} from './connection-door-types';

const empty = blankHallway({ mapId: 'm', fromSystemId: 1, toSystemId: 2 });

describe('connection door types', () => {
  it('treats a named code as an entrance and K162 as an exit', () => {
    expect(isEntranceType('C247')).toBe(true);
    expect(isEntranceType('K162')).toBe(false);
    expect(isEntranceType(null)).toBe(false);
  });

  it('reads types from the two door values', () => {
    const hallway = {
      ...empty,
      from: { ...blankDoor(), typeCode: 'C247' },
      to: { ...blankDoor(), typeCode: 'K162' },
    };
    expect(hallwayDoorTypes(hallway)).toEqual({ from: 'C247', to: 'K162' });
  });

  it('fills a blank opposite door with K162 only when this door becomes an entrance', () => {
    expect(applyDoorType({ from: null, to: null }, 'from', 'C247')).toEqual({
      from: 'C247',
      to: 'K162',
    });
    expect(applyDoorType({ from: null, to: null }, 'from', 'K162')).toEqual({
      from: 'K162',
      to: null,
    });
    expect(applyDoorType({ from: 'C247', to: 'K162' }, 'to', null)).toEqual({
      from: 'C247',
      to: null,
    });
  });

  it('fills K162 on the attached door when the other door is already an entrance', () => {
    expect(
      applyReturnDoorType({ from: 'C247', to: null }, 'to', null),
    ).toEqual({ from: 'C247', to: 'K162' });
    expect(
      applyReturnDoorType({ from: 'C247', to: null }, 'to', 'B274'),
    ).toEqual({ from: 'C247', to: 'K162' });
  });

  it('writes a stub type when the inbound door is only a K162 or blank', () => {
    expect(
      applyReturnDoorType({ from: 'K162', to: null }, 'to', 'C247'),
    ).toEqual({ from: 'K162', to: 'C247' });
    expect(
      applyReturnDoorType({ from: null, to: null }, 'to', 'C247'),
    ).toEqual({ from: 'K162', to: 'C247' });
    expect(
      applyReturnDoorType({ from: 'K162', to: null }, 'to', null),
    ).toEqual({ from: 'K162', to: null });
  });

  it('patches both doors and identity together, with no one-code snapshot', () => {
    expect(typedDoorsFrom('from', 'C247')).toEqual({
      from: { ...blankDoor(), typeCode: 'C247' },
      to: { ...blankDoor(), typeCode: 'K162' },
    });
    expect(connectionTypePatch(empty, 'to', 'C247', 'human')).toEqual({
      from: { ...blankDoor(), typeCode: 'K162' },
      to: { ...blankDoor(), typeCode: 'C247' },
      identity: { kind: 'typed', provenance: 'human' },
    });
    expect(
      returnDoorTypePatch(
        {
          ...empty,
          from: { ...blankDoor(), typeCode: 'C247' },
          identity: identityFromDoors('C247', null, 'human'),
        },
        'to',
        null,
        'human',
      ),
    ).toEqual({
      from: { ...blankDoor(), typeCode: 'C247' },
      to: { ...blankDoor(), typeCode: 'K162' },
      identity: { kind: 'typed', provenance: 'human' },
    });
  });
});
