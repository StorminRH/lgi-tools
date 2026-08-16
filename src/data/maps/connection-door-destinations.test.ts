import { describe, expect, it } from 'vitest';
import {
  absorbDoorKnowledge,
  absorbDoorLeadsNote,
  doorDestination,
  doorLeadsTo,
  keepTypedLeadsTo,
  uniqueCounterpartStub,
  winningTypeProvenance,
} from './connection-door-destinations';

describe('connection door destinations', () => {
  it('crosses the two system IDs once both doors are known', () => {
    expect(doorDestination(10, 20, 'from')).toBe(20);
    expect(doorDestination(10, 20, 'to')).toBe(10);
    expect(doorDestination(10, null, 'from')).toBeNull();
    expect(doorDestination(10, null, 'to')).toBeNull();
  });

  it('shows the other system unless that face has a mismatched typed system', () => {
    expect(keepTypedLeadsTo(20, null)).toBe(20);
    expect(keepTypedLeadsTo(20, 20)).toBe(20);
    expect(keepTypedLeadsTo(20, 30)).toBe(30);
    expect(keepTypedLeadsTo(null, 30)).toBe(30);
    expect(doorLeadsTo(10, 20, 'from')).toBe(20);
    expect(doorLeadsTo(10, 20, 'from', 30, null)).toBe(30);
    expect(absorbDoorLeadsNote(undefined, undefined, 20)).toBeUndefined();
    expect(absorbDoorLeadsNote(undefined, 20, 20)).toBeUndefined();
    expect(absorbDoorLeadsNote(undefined, 30, 20)).toBe(30);
    expect(absorbDoorLeadsNote(30, 40, 20)).toBe(30);
  });

  it('joins a unique leftover stub and refuses to guess among several', () => {
    const leftover = { _id: 'c3', toSystemId: null as number | null };
    expect(
      uniqueCounterpartStub(
        [leftover, { _id: 'jump', toSystemId: 20 }],
        new Set(['jump']),
      ),
    ).toEqual(leftover);
    expect(
      uniqueCounterpartStub(
        [leftover, { _id: 'other', toSystemId: null }],
        new Set(),
      ),
    ).toBeNull();
    expect(
      uniqueCounterpartStub(
        [{ _id: 'dead', toSystemId: null, deletedAt: 1 }],
        new Set(),
      ),
    ).toBeNull();
  });

  it('writes the stub entrance onto the attached door and fills a blank exit', () => {
    expect(
      absorbDoorKnowledge(
        {
          massState: null,
          shipSize: null,
          wormholeTypeCode: null,
        },
        {
          massState: 'stable',
          shipSize: 'M',
          wormholeTypeCode: 'C247',
          typedSide: 'from',
        },
        'from',
      ),
    ).toMatchObject({
      fromWormholeTypeCode: 'C247',
      toWormholeTypeCode: 'K162',
      massState: 'stable',
      shipSize: 'M',
    });
  });

  it('copies a stronger stub type provenance and never downgrades the survivor', () => {
    expect(winningTypeProvenance(undefined, 'human')).toBe('human');
    expect(winningTypeProvenance('assumed', 'human')).toBe('human');
    expect(winningTypeProvenance('human', 'assumed')).toBeUndefined();
    expect(winningTypeProvenance('jump-verified', 'human')).toBeUndefined();
    expect(winningTypeProvenance('human', 'human')).toBeUndefined();
    expect(
      absorbDoorKnowledge(
        { massState: null, shipSize: null, wormholeTypeCode: null },
        {
          massState: null,
          shipSize: null,
          wormholeTypeCode: 'C247',
          typeProvenance: 'human',
        },
        'from',
      ),
    ).toMatchObject({ typeProvenance: 'human' });
    expect(
      absorbDoorKnowledge(
        {
          massState: null,
          shipSize: null,
          wormholeTypeCode: 'B274',
          typeProvenance: 'human',
        },
        {
          massState: null,
          shipSize: null,
          wormholeTypeCode: 'C247',
          typeProvenance: 'assumed',
        },
        'from',
      ).typeProvenance,
    ).toBeUndefined();
  });
});
