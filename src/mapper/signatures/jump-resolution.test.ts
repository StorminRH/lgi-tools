import { describe, expect, it } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/use-map-chain';
import {
  hasPendingResolution,
  jumpAnswerTarget,
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
    fromSignalPct: null,
    firstSeenAt: null,
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
    toSignatureId: null,
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
    _creationTime: 1,
    fromSystemId: 1,
    fromSignatureId: 'DEF-456',
    toSignatureId: null,
    fromSignalPct: null,
    firstSeenAt: null,
    wormholeTypeCode: null,
    toSystemId: null,
    typedSide: null,
    massState: null,
    shipSize: null,
    lifeStage: null,
    lifeStageObservedAt: null,
    deathEarliestAt: null,
    deathLatestAt: null,
    deletedAt: null,
    purgeAfter: null,
    fromDestinationHint: null,
    toDestinationHint: null,
    destinationProvenance: null,
    pendingCandidates: null,
    observedMassKg: null,
    observedMassAtStateKg: null,
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
  it('requires exact multi-survivor ambiguity and preserves matcher order', () => {
    expect(hasPendingResolution(pending())).toBe(true);
    expect(hasPendingResolution(pending({ destinationProvenance: 'jump-verified' }))).toBe(false);
    expect(hasPendingResolution(pending({ pendingCandidates: null }))).toBe(false);
    expect(hasPendingResolution(pending({ pendingCandidates: [] }))).toBe(false);
    expect(hasPendingResolution(pending({ pendingCandidates: [C1] }))).toBe(false);
    expect(hasPendingResolution(pending({ deletedAt: 5 }))).toBe(false);

    const candidates = jumpResolutionCandidates(pending(), HOLES);
    if (candidates === null) throw new Error('expected exact survivor candidates');
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
    expect(jumpAnswerTarget(candidates[0]!)).toBeNull();
    expect(jumpAnswerTarget(candidates[1]!)).toBe(STUB);

    expect(jumpResolutionCandidates(pending(), [])).toBeNull();
    expect(
      jumpResolutionCandidates(
        pending({ pendingCandidates: [STUB, C1] }),
        HOLES,
      )?.map((candidate) => candidate.connectionId),
    ).toEqual([STUB, C1]);
  });

  it('surfaces the newest exact prompt with the shared destination readout', () => {
    const older = pending();
    const newer = pending({
      connectionId: 'c9' as Id<'mapConnections'>,
      _creationTime: 9,
      pendingCandidates: ['c9' as Id<'mapConnections'>, STUB],
    });
    const details = new Map([
      [older.connectionId, older],
      [newer.connectionId, newer],
    ]);

    const systemInfo = (id: number) =>
      id === 2
        ? { id, name: 'J123456', security: -1, whClassId: 4 }
        : null;
    expect(pendingJumpResolution(details, HOLES, new Set(), systemInfo)).toEqual(
      expect.objectContaining({
        connectionId: 'c9',
        destination: { label: 'J123456 - C4', tone: 'text-wh-c4' },
      }),
    );
    expect(
      pendingJumpResolution(details, HOLES, new Set(['c9']), systemInfo)?.connectionId,
    ).toBe('c1');
    expect(
      pendingJumpResolution(details, HOLES, new Set(['c1', 'c9']), systemInfo),
    ).toBeNull();

    const settled = detail({ connectionId: C1, destinationProvenance: 'jump-verified' });
    expect(
      pendingJumpResolution(new Map([[C1, settled]]), HOLES, new Set(), systemInfo),
    ).toBeNull();
  });
});
