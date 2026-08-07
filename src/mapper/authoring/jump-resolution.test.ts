import { describe, expect, it } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/use-map-chain';
import {
  hasPendingResolution,
  jumpCandidateLabel,
  jumpResolutionCandidates,
  pendingJumpResolution,
} from './jump-resolution';

function detail(
  partial: Partial<ConnectionDetail> & { connectionId: Id<'mapConnections'> },
): ConnectionDetail {
  return {
    _creationTime: 1,
    fromSystemId: 1,
    toSystemId: 2,
    wormholeTypeCode: null,
    massState: null,
    shipSize: null,
    lifeStage: null,
    lifeStageObservedAt: null,
    deathEarliestAt: null,
    deathLatestAt: null,
    deletedAt: null,
    purgeAfter: null,
    fromSignatureId: null,
    fromDestinationHint: null,
    destinationProvenance: null,
    pendingCandidates: null,
    observedMassKg: null,
    observedMassAtStateKg: null,
    ...partial,
  };
}

const C1 = 'c1' as Id<'mapConnections'>;
const STUB = 'stub-2' as Id<'mapConnections'>;

const HOLES: readonly UnresolvedHoleSummary[] = [
  {
    connectionId: STUB,
    fromSystemId: 1,
    fromSignatureId: 'DEF-456',
    wormholeTypeCode: null,
  },
];

function pending(partial: Partial<ConnectionDetail> = {}): ConnectionDetail {
  return detail({
    connectionId: C1,
    fromSignatureId: 'ABC-123',
    wormholeTypeCode: 'K162',
    destinationProvenance: 'assumed',
    pendingCandidates: [C1, STUB],
    ...partial,
  });
}

describe('jump resolution', () => {
  it('requires assumed live survivors, labels candidates, and drops resolved stubs', () => {
    expect(hasPendingResolution(pending())).toBe(true);
    expect(hasPendingResolution(pending({ destinationProvenance: 'jump-verified' }))).toBe(false);
    expect(hasPendingResolution(pending({ pendingCandidates: null }))).toBe(false);
    expect(hasPendingResolution(pending({ pendingCandidates: [] }))).toBe(false);
    expect(hasPendingResolution(pending({ deletedAt: 5 }))).toBe(false);

    const candidates = jumpResolutionCandidates(pending(), HOLES);
    expect(candidates).toEqual([
      {
        connectionId: C1,
        signatureId: 'ABC-123',
        wormholeTypeCode: 'K162',
        isCurrent: true,
      },
      {
        connectionId: STUB,
        signatureId: 'DEF-456',
        wormholeTypeCode: null,
        isCurrent: false,
      },
    ]);
    expect(jumpCandidateLabel(candidates[0]!)).toBe('ABC-123 · K162');
    expect(jumpCandidateLabel(candidates[1]!)).toBe('DEF-456 · Unidentified');

    expect(jumpResolutionCandidates(pending(), [])).toEqual([
      {
        connectionId: C1,
        signatureId: 'ABC-123',
        wormholeTypeCode: 'K162',
        isCurrent: true,
      },
    ]);
  });

  it('surfaces the newest pending row, honors dismissal, and ignores settled rows', () => {
    const older = pending();
    const newer = pending({
      connectionId: 'c9' as Id<'mapConnections'>,
      _creationTime: 9,
      pendingCandidates: ['c9' as Id<'mapConnections'>],
    });
    const details = new Map([
      [older.connectionId, older],
      [newer.connectionId, newer],
    ]);

    expect(pendingJumpResolution(details, HOLES, new Set())?.connectionId).toBe('c9');
    expect(
      pendingJumpResolution(details, HOLES, new Set(['c9']))?.connectionId,
    ).toBe('c1');
    expect(pendingJumpResolution(details, HOLES, new Set(['c1', 'c9']))).toBeNull();

    const settled = detail({ connectionId: C1, destinationProvenance: 'jump-verified' });
    expect(
      pendingJumpResolution(new Map([[C1, settled]]), HOLES, new Set()),
    ).toBeNull();
  });
});
