import { expect, it, vi } from 'vitest';
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

it('answers jump picks through the route, dismisses only delivered answers, and notifies typed holes when held', async () => {
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

it('announces successful severs, skips swallowed refusals, and deletes unresolved stubs via removeSignatures', async () => {
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

  const { connectionLifecycleActions, removeStubAndAnnounce } = await import(
    './connection-authoring-api'
  );
  const stubApi = authoring();
  stubApi.removeSignatures.mockResolvedValueOnce({ changed: 1 });
  const stubDone = vi.fn();
  connectionLifecycleActions({
    mapId: 'map-a',
    connectionId: 'stub-1' as Id<'mapConnections'>,
    authoring: stubApi,
    onDone: stubDone,
    stub: { systemId: 7, signatureId: 'ABC-123' },
  }).remove();
  await vi.waitFor(() => expect(stubApi.removeSignatures).toHaveBeenCalledOnce());
  expect(stubApi.severConnection).not.toHaveBeenCalled();
  expect(stubApi.removeSignatures).toHaveBeenCalledWith({
    mapId: 'map-a',
    systemId: 7,
    signatureIds: ['ABC-123'],
  });
  expect(stubDone).toHaveBeenCalledOnce();

  stubApi.removeSignatures.mockResolvedValueOnce(undefined);
  toastError.mockClear();
  await removeStubAndAnnounce({
    mapId: 'map-a',
    systemId: 7,
    signatureId: 'ABC-123',
    authoring: stubApi,
    onDone: vi.fn(),
  });
  expect(toastError).toHaveBeenCalledOnce();
});
