import { describe, expect, it } from 'vitest';
import {
  applyDoorType,
  applyReturnDoorType,
  connectionDoorTypes,
  connectionTypePatch,
  isEntranceType,
  legacyTypeSnapshot,
  returnDoorTypePatch,
  storedDoorTypes,
} from './connection-door-types';

describe('connection door types', () => {
  it('treats a named code as an entrance and K162 as an exit', () => {
    expect(isEntranceType('C247')).toBe(true);
    expect(isEntranceType('K162')).toBe(false);
    expect(isEntranceType(null)).toBe(false);
  });

  it('expands a legacy named type into an entrance plus a K162 exit', () => {
    expect(
      connectionDoorTypes({ wormholeTypeCode: 'C247', typedSide: 'from' }),
    ).toEqual({ from: 'C247', to: 'K162' });
    expect(
      connectionDoorTypes({ wormholeTypeCode: 'B274', typedSide: 'to' }),
    ).toEqual({ from: 'K162', to: 'B274' });
  });

  it('does not invent a K162 on a legacy one-code row for layout and census', () => {
    expect(
      storedDoorTypes({ wormholeTypeCode: 'C247', typedSide: 'from' }),
    ).toEqual({ from: 'C247', to: null });
  });

  it('leaves the other door blank when the legacy row is only a K162', () => {
    expect(
      connectionDoorTypes({ wormholeTypeCode: 'K162', typedSide: 'from' }),
    ).toEqual({ from: 'K162', to: null });
  });

  it('ignores blank door fields so a later one-code write still counts', () => {
    expect(
      connectionDoorTypes({
        fromWormholeTypeCode: null,
        toWormholeTypeCode: null,
        wormholeTypeCode: 'C247',
        typedSide: 'from',
      }),
    ).toEqual({ from: 'C247', to: 'K162' });
  });

  it('prefers stored door fields over the one-code snapshot', () => {
    expect(
      connectionDoorTypes({
        fromWormholeTypeCode: 'K162',
        toWormholeTypeCode: 'C247',
        wormholeTypeCode: 'C247',
        typedSide: 'from',
      }),
    ).toEqual({ from: 'K162', to: 'C247' });
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

  it('keeps the one-code snapshot on the entrance door when one exists', () => {
    expect(legacyTypeSnapshot({ from: 'C247', to: 'K162' })).toEqual({
      wormholeTypeCode: 'C247',
      typedSide: 'from',
    });
    expect(connectionTypePatch({}, 'to', 'C247')).toEqual({
      fromWormholeTypeCode: 'K162',
      toWormholeTypeCode: 'C247',
      wormholeTypeCode: 'C247',
      typedSide: 'to',
    });
    expect(
      returnDoorTypePatch({ wormholeTypeCode: 'C247', typedSide: 'from' }, 'to', null),
    ).toEqual({
      fromWormholeTypeCode: 'C247',
      toWormholeTypeCode: 'K162',
      wormholeTypeCode: 'C247',
      typedSide: 'from',
    });
  });

  it('keeps a named far-side type in the one-code snapshot', () => {
    expect(legacyTypeSnapshot({ from: 'C247', to: 'B274' }, 'to')).toEqual({
      wormholeTypeCode: 'B274',
      typedSide: 'to',
    });
    expect(
      connectionTypePatch(
        { fromWormholeTypeCode: 'C247', toWormholeTypeCode: 'K162' },
        'to',
        'B274',
      ),
    ).toEqual({
      fromWormholeTypeCode: 'C247',
      toWormholeTypeCode: 'B274',
      wormholeTypeCode: 'B274',
      typedSide: 'to',
    });
  });
});
