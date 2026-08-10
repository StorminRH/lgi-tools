import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { ConnectionDetail } from '../chain/use-map-chain';
import {
  answerAndAnnounce,
  answerJumpResolution,
  applyWormholeType,
  severAndAnnounce,
} from './connection-authoring-api';
import { MapAuthoringOverlay } from './MapAuthoringOverlay';

const announce = vi.hoisted(() => vi.fn());
const postJump = vi.hoisted(() =>
  vi.fn(async () => ({ status: 'processed', outcome: 'confirmed', emitted: true })),
);

vi.mock('./sever-toast', () => ({
  announceSeverOutcome: announce,
}));

const toastError = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/toast', () => ({
  toast: { error: toastError },
}));

vi.mock('../jump-client', () => ({
  postJumpRequest: postJump,
}));

vi.mock('../log/MapEventLog', () => ({
  MapEventLog: (props: { canEdit: boolean; events: readonly unknown[] }) =>
    createElement('div', {
      'data-map-event-log': '',
      'data-can-edit': props.canEdit ? 'true' : 'false',
      'data-event-count': String(props.events.length),
    }),
}));

const NOW = 10_000;

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
    fromDestinationHint: null,
    destinationProvenance: null,
    pendingCandidates: null,
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
    severConnection: vi.fn(
      async (): Promise<
        | { outcome: 'retained' }
        | { outcome: 'removed'; systemIds: number[] }
        | undefined
      > => ({ outcome: 'retained' }),
    ),
    restoreSeveredBranch: vi.fn(),
    restoreConnection: vi.fn(),
    restoreSignatures: vi.fn(),
  };
}

const PENDING_HOLE = {
  connectionId: 'stub-2' as Id<'mapConnections'>,
  _creationTime: 1,
  fromSystemId: 1,
  fromSignatureId: 'DEF-456',
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
} as const;

describe('MapAuthoringOverlay', () => {
  it('mounts the ledger and no connection card of its own', () => {
    const markup = renderToStaticMarkup(
      createElement(MapAuthoringOverlay, {
        mapId: 'map-a',
        canEdit: true,
        connectionDetails: new Map(),
        unresolvedHoles: [],
        connectionPresentationNow: NOW,
        events: [],
        authoring: authoring(),
      }),
    );
    expect(markup).toContain('data-map-event-log');
    // The edge-anchored card is retired (ruling D-F) — one editor now.
    expect(markup).not.toContain('data-map-connection-details');
    expect(markup).not.toContain('data-map-connection-fields');
  });

  it('surfaces the pending auto-link prompt for editors only', () => {
    const connectionId = 'c1' as Id<'mapConnections'>;
    const pending = detail({
      connectionId,
      fromSignatureId: 'ABC-123',
      wormholeTypeCode: 'K162',
      destinationProvenance: 'assumed',
      pendingCandidates: [connectionId, 'stub-2' as Id<'mapConnections'>],
    });
    const editor = renderToStaticMarkup(
      createElement(MapAuthoringOverlay, {
        mapId: 'map-a',
        canEdit: true,
        connectionDetails: new Map([[connectionId, pending]]),
        unresolvedHoles: [PENDING_HOLE],
        connectionPresentationNow: NOW,
        events: [],
        authoring: authoring(),
      }),
    );
    expect(editor).toContain('data-map-jump-prompt');
    expect(editor).toContain('ABC-123');
    expect(editor).toContain('data-map-jump-confirm');
    expect(editor).toContain('data-map-jump-correct="stub-2"');
    expect(editor).toContain('DEF-456');
    expect(editor).toContain('data-map-jump-dismiss');

    const viewer = renderToStaticMarkup(
      createElement(MapAuthoringOverlay, {
        mapId: 'map-a',
        canEdit: false,
        connectionDetails: new Map([[connectionId, pending]]),
        unresolvedHoles: [PENDING_HOLE],
        connectionPresentationNow: NOW,
        events: [],
        authoring: authoring(),
      }),
    );
    expect(viewer).not.toContain('data-map-jump-prompt');
  });
});

describe('connection authoring dispatchers', () => {
  it('dispatches confirm and correct answers through the jump route', async () => {
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

  it('dismisses a prompt only on a delivered answer and announces failures', async () => {
    postJump.mockClear();
    toastError.mockClear();
    const dismissed = vi.fn();
    await answerAndAnnounce({
      mapId: 'map-a',
      connectionId: 'c1' as Id<'mapConnections'>,
      targetConnectionId: null,
      dismiss: dismissed,
    });
    expect(dismissed).toHaveBeenCalledTimes(1);
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
    await applyWormholeType({
      mapId: 'map-a',
      connection,
      value: 'B274',
      authoring: api,
    });
    expect(postJump).toHaveBeenCalledWith({
      kind: 'typed-hole',
      mapId: 'map-a',
      connectionId: 'c1',
    });

    // A swallowed server refusal resolves undefined: no notification.
    postJump.mockClear();
    api.setConnectionWormholeType.mockResolvedValueOnce(undefined as never);
    await applyWormholeType({
      mapId: 'map-a',
      connection,
      value: 'B274',
      authoring: api,
    });
    expect(postJump).not.toHaveBeenCalled();

    // Clearing the code notifies too: the server must get the chance to
    // delete a now-superseded observation under the preserved dedupe key.
    postJump.mockClear();
    api.setConnectionWormholeType.mockResolvedValueOnce({ changed: true } as never);
    await applyWormholeType({
      mapId: 'map-a',
      connection,
      value: null,
      authoring: api,
    });
    expect(postJump).toHaveBeenCalledWith({
      kind: 'typed-hole',
      mapId: 'map-a',
      connectionId: 'c1',
    });
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
});
