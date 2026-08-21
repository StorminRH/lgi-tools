import { describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { ConnectionDetail } from '../chain/use-map-chain';
import {
  answerAndAnnounce,
  answerJumpResolution,
  applyWormholeType,
  severAndAnnounce,
} from './connection-authoring-api';

const announce = vi.hoisted(() => vi.fn());
const postJump = vi.hoisted(() =>
  vi.fn(async () => ({ status: 'processed', outcome: 'confirmed', emitted: true })),
);
const toastError = vi.hoisted(() => vi.fn());

vi.mock('../authoring/sever-toast', () => ({
  announceSeverOutcome: announce,
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { error: toastError, success: vi.fn() },
}));
vi.mock('./signature-toast', () => ({
  announceSignatureRemoval: vi.fn(),
}));
vi.mock('../jump-client', () => ({
  postJumpRequest: postJump,
}));

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
    pendingResolutionCharacterId: null,
    observedMassKg: null,
    observedMassAtStateKg: null,
    ...partial,
  };
}

function authoring() {
  return {
    setConnectionWormholeType: vi.fn(),
    setConnectionShipSize: vi.fn(),
    setConnectionMassState: vi.fn(),
    setConnectionLifeStage: vi.fn(),
    setConnectionDestinationHint: vi.fn(),
    setConnectionDestination: vi.fn(),
    linkStubToResolvedConnection: vi.fn(),
    severConnection: vi.fn(
      async (): Promise<
        | { outcome: 'retained' }
        | { outcome: 'removed'; systemIds: number[] }
        | undefined
      > => ({ outcome: 'retained' }),
    ),
    restoreSeveredBranch: vi.fn(),
    restoreConnection: vi.fn(),
    removeSignatures: vi.fn(),
    restoreSignatures: vi.fn(),
  };
}

describe('connection authoring dispatchers', () => {
  it('dispatches current and alternative signature picks through the jump route', async () => {
    postJump.mockClear();
    await answerJumpResolution({
      mapId: 'map-a',
      connectionId: 'c1' as Id<'mapConnections'>,
      targetConnectionId: null,
    });
    expect(postJump).toHaveBeenCalledWith({
      kind: 'confirm',
      mapId: 'map-a',
      connectionId: 'c1',
      targetConnectionId: null,
    });

    postJump.mockClear();
    await answerJumpResolution({
      mapId: 'map-a',
      connectionId: 'c1' as Id<'mapConnections'>,
      targetConnectionId: 'stub-2',
    });
    expect(postJump).toHaveBeenCalledWith({
      kind: 'confirm',
      mapId: 'map-a',
      connectionId: 'c1',
      targetConnectionId: 'stub-2',
    });
  });

  it('dismisses only delivered answers and announces retryable failures', async () => {
    postJump.mockClear();
    toastError.mockClear();
    const dismissed = vi.fn();
    await answerAndAnnounce({
      mapId: 'map-a',
      connectionId: 'c1' as Id<'mapConnections'>,
      targetConnectionId: null,
      dismiss: dismissed,
    });
    expect(dismissed).toHaveBeenCalledOnce();
    expect(toastError).not.toHaveBeenCalled();

    for (const outcome of [null, { status: 'retry', reason: 'convex-resolve' }]) {
      postJump.mockResolvedValueOnce(outcome as never);
      const keep = vi.fn();
      await answerAndAnnounce({
        mapId: 'map-a',
        connectionId: 'c1' as Id<'mapConnections'>,
        targetConnectionId: 'stub-2',
        dismiss: keep,
      });
      expect(keep).not.toHaveBeenCalled();
    }
    expect(toastError).toHaveBeenCalledTimes(2);
  });

  it('notifies the route after manual typing only when the mutation held', async () => {
    const api = authoring();
    const connection = detail({ connectionId: 'c1' as Id<'mapConnections'> });

    postJump.mockClear();
    api.setConnectionWormholeType.mockResolvedValueOnce({ changed: true } as never);
    await applyWormholeType({ mapId: 'map-a', connection, value: 'B274', authoring: api });
    expect(postJump).toHaveBeenCalledWith({
      kind: 'typed-hole',
      mapId: 'map-a',
      connectionId: 'c1',
    });

    postJump.mockClear();
    api.setConnectionWormholeType.mockResolvedValueOnce(undefined as never);
    await applyWormholeType({ mapId: 'map-a', connection, value: 'B274', authoring: api });
    expect(postJump).not.toHaveBeenCalled();
  });

  it('announces a successful sever and skips swallowed refusals', async () => {
    const onDone = vi.fn();
    const onUndo = vi.fn();
    const api = authoring();
    await severAndAnnounce({
      mapId: 'map-a',
      connectionId: 'c1' as Id<'mapConnections'>,
      authoring: api,
      onDone,
      onUndo,
    });
    expect(onDone).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: 'c1', onUndo }),
    );

    api.severConnection.mockResolvedValueOnce(undefined);
    onDone.mockClear();
    announce.mockClear();
    await severAndAnnounce({
      mapId: 'map-a',
      connectionId: 'c1' as Id<'mapConnections'>,
      authoring: api,
      onDone,
      onUndo,
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it('deletes unresolved stubs through removeSignatures, not sever', async () => {
    const { connectionLifecycleActions } = await import('./connection-authoring-api');
    const api = authoring();
    api.removeSignatures.mockResolvedValueOnce({ changed: 1 });
    const onDone = vi.fn();
    connectionLifecycleActions({
      mapId: 'map-a',
      connectionId: 'stub-1' as Id<'mapConnections'>,
      authoring: api,
      onDone,
      stub: { systemId: 7, signatureId: 'ABC-123' },
    }).remove();
    await vi.waitFor(() => expect(api.removeSignatures).toHaveBeenCalledOnce());
    expect(api.severConnection).not.toHaveBeenCalled();
    expect(api.removeSignatures).toHaveBeenCalledWith({
      mapId: 'map-a',
      systemId: 7,
      signatureIds: ['ABC-123'],
    });
    expect(onDone).toHaveBeenCalledOnce();

    api.removeSignatures.mockResolvedValueOnce(undefined);
    toastError.mockClear();
    connectionLifecycleActions({
      mapId: 'map-a',
      connectionId: 'stub-1' as Id<'mapConnections'>,
      authoring: api,
      onDone: vi.fn(),
      stub: { systemId: 7, signatureId: 'ABC-123' },
    }).remove();
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledOnce());
  });
});
