import { describe, expect, it } from 'vitest';
import { blankDoor, blankHallway, leadsToFromHint, leadsToFromSystem } from './connection-hallway';
import {
  absorbDoorKnowledge,
  absorbDoorLeadsNote,
  doorDestination,
  doorLeadsTo,
  keepTypedLeadsTo,
  uniqueCounterpartStub,
  winningTypeProvenance,
} from './connection-door-destinations';

const empty = blankHallway({ mapId: 'm', fromSystemId: 1, toSystemId: 2 });

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
    expect(doorLeadsTo(10, 20, 'from', blankDoor())).toBe(20);
    expect(
      doorLeadsTo(10, 20, 'from', { ...blankDoor(), leadsTo: leadsToFromSystem(30) }),
    ).toBe(30);
    expect(absorbDoorLeadsNote({ kind: 'unset' }, { kind: 'unset' }, 20)).toEqual({
      kind: 'unset',
    });
    expect(absorbDoorLeadsNote({ kind: 'unset' }, leadsToFromSystem(20), 20)).toEqual({
      kind: 'unset',
    });
    expect(absorbDoorLeadsNote({ kind: 'unset' }, leadsToFromSystem(30), 20)).toEqual({
      kind: 'system',
      systemId: 30,
    });
    expect(absorbDoorLeadsNote(leadsToFromSystem(30), leadsToFromSystem(40), 20)).toEqual({
      kind: 'system',
      systemId: 30,
    });
  });

  it('joins a unique leftover stub and refuses to guess among several', () => {
    const leftover = {
      _id: 'c3',
      toSystemId: null as number | null,
      tombstone: { kind: 'live' as const },
    };
    expect(
      uniqueCounterpartStub(
        [leftover, { _id: 'jump', toSystemId: 20, tombstone: { kind: 'live' as const } }],
        new Set(['jump']),
      ),
    ).toEqual(leftover);
    expect(
      uniqueCounterpartStub(
        [leftover, { _id: 'other', toSystemId: null, tombstone: { kind: 'live' as const } }],
        new Set(),
      ),
    ).toBeNull();
    expect(
      uniqueCounterpartStub(
        [{ _id: 'dead', toSystemId: null, tombstone: { kind: 'removed' as const, deletedAt: 1, purgeAfter: null } }],
        new Set(),
      ),
    ).toBeNull();
  });

  it('writes the stub entrance onto the attached door and fills a blank exit', () => {
    expect(
      absorbDoorKnowledge(
        empty,
        {
          ...empty,
          from: { ...blankDoor(), typeCode: 'C247' },
          identity: { kind: 'typed', provenance: 'human' },
          massState: 'stable',
          shipSize: 'M',
        },
        'from',
      ),
    ).toMatchObject({
      from: { typeCode: 'C247' },
      to: { typeCode: 'K162' },
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
        empty,
        {
          ...empty,
          from: { ...blankDoor(), typeCode: 'C247' },
          identity: { kind: 'typed', provenance: 'human' },
        },
        'from',
      ).identity,
    ).toEqual({ kind: 'typed', provenance: 'human' });
    expect(
      absorbDoorKnowledge(
        {
          ...empty,
          from: { ...blankDoor(), typeCode: 'B274' },
          identity: { kind: 'typed', provenance: 'human' },
        },
        {
          ...empty,
          from: { ...blankDoor(), typeCode: 'C247' },
          identity: { kind: 'typed', provenance: 'assumed' },
        },
        'from',
      ).identity,
    ).toEqual({ kind: 'typed', provenance: 'human' });
    expect(leadsToFromHint('unknown').kind).toBe('hint');
  });
});
