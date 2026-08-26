import { describe, expect, it } from 'vitest';
import { foldLegacyConnection } from './connection-fold';
import {
  blankHallway,
  connectionLifetimeFrom,
  doorHint,
  doorSystemNote,
  identityFromDoors,
  isPendingResolution,
  pendingResolution,
  leadsToFromHint,
  leadsToFromSystem,
  lifetimeDeathWindow,
  lifetimeStage,
} from './connection-hallway';

describe('connection hallway', () => {
  it('starts a hallway with two blank doors and exclusive unset unions', () => {
    const row = blankHallway({ mapId: 'm', fromSystemId: 1, toSystemId: 2 });
    expect(row.from.leadsTo).toEqual({ kind: 'unset' });
    expect(row.to.leadsTo).toEqual({ kind: 'unset' });
    expect(row.identity).toEqual({ kind: 'unknown' });
    expect(row.lifetime).toEqual({ kind: 'unknown' });
    expect(row.resolution).toEqual({ kind: 'open' });
    expect(row.tombstone).toEqual({ kind: 'live' });
  });

  it('keeps a class note and a typed system from sitting on the same door', () => {
    expect(leadsToFromHint('hisec')).toEqual({ kind: 'hint', hint: 'hisec' });
    expect(leadsToFromSystem(20)).toEqual({ kind: 'system', systemId: 20 });
    expect(doorHint({ ...blankHallway({ mapId: 'm', fromSystemId: 1, toSystemId: 2 }).from, leadsTo: leadsToFromHint('hisec') })).toBe('hisec');
    expect(doorSystemNote({ ...blankHallway({ mapId: 'm', fromSystemId: 1, toSystemId: 2 }).from, leadsTo: leadsToFromSystem(20) })).toBe(20);
    expect(doorHint({ ...blankHallway({ mapId: 'm', fromSystemId: 1, toSystemId: 2 }).from, leadsTo: leadsToFromSystem(20) })).toBeNull();
  });

  it('stores type provenance only when a mouth has a type', () => {
    expect(identityFromDoors(null, null, 'human')).toEqual({ kind: 'unknown' });
    expect(identityFromDoors('C247', 'K162', 'human')).toEqual({
      kind: 'typed',
      provenance: 'human',
    });
  });

  it('stores a death window as both bounds, never a half pair or eolAt', () => {
    expect(
      connectionLifetimeFrom({
        lifeStage: 'under_4_hours',
        observedAt: 10,
        death: { earliestAt: 1, latestAt: 2 },
      }),
    ).toEqual({
      kind: 'window',
      earliestAt: 1,
      latestAt: 2,
      lifeStage: 'under_4_hours',
      observedAt: 10,
    });
    expect(
      lifetimeDeathWindow(
        connectionLifetimeFrom({
          lifeStage: 'under_1_day',
          observedAt: 10,
          death: null,
        }),
      ),
    ).toBeNull();
    expect(
      lifetimeStage(
        connectionLifetimeFrom({
          lifeStage: 'under_1_day',
          observedAt: 10,
          death: null,
        }),
      ),
    ).toBe('under_1_day');
  });

  it('requires a character together with a multi-survivor pending list', () => {
    expect(isPendingResolution(pendingResolution(['a', 'b'], 1))).toBe(true);
    expect(isPendingResolution(pendingResolution(['a'], 1))).toBe(false);
  });
});

describe('foldLegacyConnection', () => {
  it('contracts a jammed bag into one hallway with two doors', () => {
    const folded = foldLegacyConnection({
      mapId: 'm',
      fromSystemId: 1,
      toSystemId: 2,
      wormholeTypeCode: 'C247',
      typedSide: 'from',
      fromWormholeTypeCode: 'C247',
      toWormholeTypeCode: 'K162',
      fromSignatureId: 'ABC-123',
      fromDestinationHint: 'hisec',
      fromDestinationSystemId: 99,
      typeProvenance: 'human',
      destinationProvenance: 'assumed',
      pendingCandidates: ['a', 'b'],
      pendingResolutionCharacterId: 7,
      lifeStage: 'under_1_hour',
      lifeStageObservedAt: 10,
      deathEarliestAt: 20,
      deathLatestAt: 30,
      deletedAt: 40,
      purgeAfter: 50,
    });
    expect(folded.from.typeCode).toBe('C247');
    expect(folded.to.typeCode).toBe('K162');
    expect(folded.from.signatureId).toBe('ABC-123');
    expect(folded.from.leadsTo).toEqual({ kind: 'system', systemId: 99 });
    expect(folded.identity).toEqual({ kind: 'typed', provenance: 'human' });
    expect(folded.lifetime).toEqual({
      kind: 'window',
      earliestAt: 20,
      latestAt: 30,
      lifeStage: 'under_1_hour',
      observedAt: 10,
    });
    expect(folded.resolution).toEqual({
      kind: 'pending',
      provenance: 'assumed',
      candidateIds: ['a', 'b'],
      characterId: 7,
    });
    expect(folded.tombstone).toEqual({
      kind: 'removed',
      deletedAt: 40,
      purgeAfter: 50,
    });
    expect(folded).not.toHaveProperty('wormholeTypeCode');
    expect(folded).not.toHaveProperty('eolAt');
    expect(folded).not.toHaveProperty('pendingCandidates');
  });
});
