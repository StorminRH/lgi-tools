import { describe, expect, it } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { blankDoor, pendingResolution } from '@/data/maps/connection-hallway';
import { connectionEditorFixture } from '../chain/__tests__/connection-editor-fixture';
import type {
  AwaitingJumpSummary,
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/connection-detail';
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
    ...connectionEditorFixture({
      fromSystemId: 1,
      toSystemId: 2,
      ...partial,
    }),
    toSystemId: partial.toSystemId ?? 2,
  };
}

const C1 = 'c1' as Id<'mapConnections'>;
const STUB = 'stub-2' as Id<'mapConnections'>;

const HOLES = [
  {
    ...connectionEditorFixture({
      connectionId: STUB,
      fromSystemId: 1,
      toSystemId: null,
      from: { ...blankDoor(), signatureId: 'DEF-456' },
    }),
    toSystemId: null,
  },
] as const satisfies readonly UnresolvedHoleSummary[];

function pending(partial: Partial<ConnectionDetail> = {}): ConnectionDetail {
  return detail({
    connectionId: C1,
    from: { ...blankDoor(), typeCode: 'K162', signatureId: 'ABC-123' },
    identity: { kind: 'typed', provenance: 'human' },
    resolution: pendingResolution([C1, STUB], 101),
    ...partial,
  });
}

const OWN = new Set([101]);

describe('jump resolution', () => {
  it('offers every deferred candidate without placing a current choice and survives static row replacement', () => {
    const awaiting: AwaitingJumpSummary = {
      ...pending(),
      toSystemId: null,
      resolution: {
        kind: 'awaiting-signature',
        destinationSystemId: 2,
        characterId: 101,
        candidates: [
          { connectionId: C1, signatureId: 'ABC-123' },
          { connectionId: STUB, signatureId: 'DEF-456' },
        ],
      },
    };
    const claimed = {
      ...HOLES[0],
      connectionId: 'claimed-static' as Id<'mapConnections'>,
    };
    const first: UnresolvedHoleSummary = { ...pending(), toSystemId: null, resolution: { kind: 'open' } };
    const systemInfo = (id: number) => ({ id, name: 'J123456', regionName: 'A-R00001', security: -1, whClassId: 4 });
    const model = pendingJumpResolution(
      new Map(), [first, claimed], new Set(), systemInfo, OWN, [awaiting],
    );
    expect(model?.destination.label).toBe('J123456 - C4');
    expect(model?.candidates.map((candidate) => [jumpAnswerTarget(candidate), candidate.isCurrent])).toEqual([
      [C1, false], ['claimed-static', false],
    ]);
    expect(pendingJumpResolution(new Map(), [first, claimed], new Set(), systemInfo, new Set(), [awaiting])).toBeNull();
    const remaining = pendingJumpResolution(new Map(), [first], new Set(), systemInfo, OWN, [awaiting]);
    expect(remaining?.candidates.map((candidate) => [jumpAnswerTarget(candidate), candidate.isCurrent]))
      .toEqual([[C1, false]]);
    expect(pendingJumpResolution(new Map(), [], new Set(), systemInfo, OWN, [awaiting])).toBeNull();
  });

  it('keeps surviving choices available when a candidate disappears before the answer', () => {
    const remaining: UnresolvedHoleSummary = { ...pending(), toSystemId: null, resolution: { kind: 'open' } };
    const awaiting: AwaitingJumpSummary = {
      ...pending(),
      toSystemId: null,
      resolution: {
        kind: 'awaiting-signature',
        destinationSystemId: 2,
        characterId: 101,
        candidates: [
          { connectionId: 'removed' as Id<'mapConnections'>, signatureId: 'GHI-789' },
          { connectionId: C1, signatureId: 'ABC-123' },
          { connectionId: STUB, signatureId: 'DEF-456' },
        ],
      },
    };
    const systemInfo = (id: number) => ({ id, name: 'J123456', regionName: 'A-R00001', security: -1, whClassId: 4 });
    const model = pendingJumpResolution(new Map(), [remaining, ...HOLES], new Set(), systemInfo, OWN, [awaiting]);
    expect(model?.candidates.map(jumpAnswerTarget)).toEqual([C1, STUB]);
  });
  it('requires exact multi-survivor ambiguity and preserves matcher order', () => {
    expect(hasPendingResolution(pending())).toBe(true);
    expect(hasPendingResolution(pending({
      resolution: { kind: 'destination', provenance: 'jump-verified' },
    }))).toBe(false);
    expect(hasPendingResolution(pending({ resolution: { kind: 'open' } }))).toBe(false);
    expect(hasPendingResolution(pending({
      resolution: { kind: 'destination', provenance: 'assumed' },
    }))).toBe(false);
    expect(hasPendingResolution(pending({
      resolution: pendingResolution([C1], 101),
    }))).toBe(false);
    expect(hasPendingResolution(pending({
      tombstone: { kind: 'removed', deletedAt: 5, purgeAfter: null },
    }))).toBe(false);

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
        pending({ resolution: pendingResolution([STUB, C1], 101) }),
        HOLES,
      )?.map((candidate) => candidate.connectionId),
    ).toEqual([STUB, C1]);
  });

  it('surfaces the newest exact prompt only for this client\'s tracked characters', () => {
    const older = pending();
    const newer = pending({
      connectionId: 'c9' as Id<'mapConnections'>,
      _creationTime: 9,
      resolution: pendingResolution(['c9' as Id<'mapConnections'>, STUB], 101),
    });
    const details = new Map([
      [older.connectionId, older],
      [newer.connectionId, newer],
    ]);

    const systemInfo = (id: number) =>
      id === 2
        ? { id, name: 'J123456', regionName: 'A-R00001', security: -1, whClassId: 4 }
        : null;
    expect(pendingJumpResolution(details, HOLES, new Set(), systemInfo, OWN)).toEqual(
      expect.objectContaining({
        connectionId: 'c9',
        destination: { label: 'J123456 - C4', tone: 'text-wh-c4' },
      }),
    );
    expect(
      pendingJumpResolution(details, HOLES, new Set(['c9']), systemInfo, OWN)?.connectionId,
    ).toBe('c1');
    expect(
      pendingJumpResolution(details, HOLES, new Set(['c1', 'c9']), systemInfo, OWN),
    ).toBeNull();

    const settled = detail({
      connectionId: C1,
      resolution: { kind: 'destination', provenance: 'jump-verified' },
    });
    expect(
      pendingJumpResolution(new Map([[C1, settled]]), HOLES, new Set(), systemInfo, OWN),
    ).toBeNull();

    expect(
      pendingJumpResolution(
        details,
        HOLES,
        new Set(),
        systemInfo,
        new Set([999]),
      ),
    ).toBeNull();
    expect(
      pendingJumpResolution(
        new Map([[C1, pending({
          resolution: { kind: 'destination', provenance: 'assumed' },
        })]]),
        HOLES,
        new Set(),
        systemInfo,
        OWN,
      ),
    ).toBeNull();
  });
});
