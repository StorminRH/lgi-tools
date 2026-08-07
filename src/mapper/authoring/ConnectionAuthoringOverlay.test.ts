import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { ConnectionDetail } from '../chain/use-map-chain';
import {
  answerAndAnnounce,
  answerJumpResolution,
  applyWormholeType,
  ConnectionAuthoringOverlay,
  severAndAnnounce,
} from './ConnectionAuthoringOverlay';

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

vi.mock('./ConnectionDetailsCard', () => ({
  ConnectionDetailsCard: (props: {
    mode: string;
    connection: ConnectionDetail;
    resolutionControls?: unknown;
  }) =>
    createElement('div', {
      'data-map-connection-details': '',
      'data-mode': props.mode,
      'data-connection-id': props.connection.connectionId,
      'data-has-resolution':
        props.resolutionControls === undefined ? 'false' : 'true',
    }),
}));

const NOW = 10_000;
const UNDO_MS = 24 * 60 * 60 * 1000;

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
  };
}

describe('ConnectionAuthoringOverlay', () => {
  it('always mounts the ledger and hides the card without a selection', () => {
    const markup = renderToStaticMarkup(
      createElement(ConnectionAuthoringOverlay, {
        mapId: 'map-a',
        canEdit: true,
        connectionDetails: new Map(),
        unresolvedHoles: [],
        connectionPresentationNow: NOW,
        events: [],
        authoring: authoring(),
        selectedConnectionId: null,
        onSelectedConnectionIdChange: vi.fn(),
      }),
    );
    expect(markup).toContain('data-map-event-log');
    expect(markup).not.toContain('data-map-connection-details');
  });

  it('opens the card in edit mode for a live connection when canEdit', () => {
    const connectionId = 'c1' as Id<'mapConnections'>;
    const markup = renderToStaticMarkup(
      createElement(ConnectionAuthoringOverlay, {
        mapId: 'map-a',
        canEdit: true,
        connectionDetails: new Map([[connectionId, detail({ connectionId })]]),
        unresolvedHoles: [],
        connectionPresentationNow: NOW,
        events: [],
        authoring: authoring(),
        selectedConnectionId: connectionId,
        onSelectedConnectionIdChange: vi.fn(),
      }),
    );
    expect(markup).toContain('data-mode="edit"');
    expect(markup).toContain('data-connection-id="c1"');
  });

  it('opens restore mode for a dying connection and withholds the card for viewers', () => {
    const connectionId = 'c2' as Id<'mapConnections'>;
    const dying = detail({
      connectionId,
      deletedAt: NOW - 1_000,
      purgeAfter: NOW + UNDO_MS,
    });
    const editor = renderToStaticMarkup(
      createElement(ConnectionAuthoringOverlay, {
        mapId: 'map-a',
        canEdit: true,
        connectionDetails: new Map([[connectionId, dying]]),
        unresolvedHoles: [],
        connectionPresentationNow: NOW,
        events: [],
        authoring: authoring(),
        selectedConnectionId: connectionId,
        onSelectedConnectionIdChange: vi.fn(),
      }),
    );
    expect(editor).toContain('data-mode="restore"');

    const viewer = renderToStaticMarkup(
      createElement(ConnectionAuthoringOverlay, {
        mapId: 'map-a',
        canEdit: false,
        connectionDetails: new Map([[connectionId, dying]]),
        unresolvedHoles: [],
        connectionPresentationNow: NOW,
        events: [],
        authoring: authoring(),
        selectedConnectionId: connectionId,
        onSelectedConnectionIdChange: vi.fn(),
      }),
    );
    expect(viewer).toContain('data-can-edit="false"');
    expect(viewer).not.toContain('data-map-connection-details');
  });

  it('withholds the card for a skeleton selection', () => {
    const connectionId = 'c3' as Id<'mapConnections'>;
    const markup = renderToStaticMarkup(
      createElement(ConnectionAuthoringOverlay, {
        mapId: 'map-a',
        canEdit: true,
        connectionDetails: new Map([
          [
            connectionId,
            detail({
              connectionId,
              deletedAt: NOW - 1_000,
              purgeAfter: null,
            }),
          ],
        ]),
        unresolvedHoles: [],
        connectionPresentationNow: NOW,
        events: [],
        authoring: authoring(),
        selectedConnectionId: connectionId,
        onSelectedConnectionIdChange: vi.fn(),
      }),
    );
    expect(markup).not.toContain('data-map-connection-details');
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
    const holes = [
      {
        connectionId: 'stub-2' as Id<'mapConnections'>,
        fromSystemId: 1,
        fromSignatureId: 'DEF-456',
        wormholeTypeCode: null,
      },
    ];
    const editor = renderToStaticMarkup(
      createElement(ConnectionAuthoringOverlay, {
        mapId: 'map-a',
        canEdit: true,
        connectionDetails: new Map([[connectionId, pending]]),
        unresolvedHoles: holes,
        connectionPresentationNow: NOW,
        events: [],
        authoring: authoring(),
        selectedConnectionId: null,
        onSelectedConnectionIdChange: vi.fn(),
      }),
    );
    expect(editor).toContain('data-map-jump-prompt');
    expect(editor).toContain('ABC-123');
    expect(editor).toContain('data-map-jump-confirm');
    expect(editor).toContain('data-map-jump-correct="stub-2"');
    expect(editor).toContain('DEF-456');
    expect(editor).toContain('data-map-jump-dismiss');

    const viewer = renderToStaticMarkup(
      createElement(ConnectionAuthoringOverlay, {
        mapId: 'map-a',
        canEdit: false,
        connectionDetails: new Map([[connectionId, pending]]),
        unresolvedHoles: holes,
        connectionPresentationNow: NOW,
        events: [],
        authoring: authoring(),
        selectedConnectionId: null,
        onSelectedConnectionIdChange: vi.fn(),
      }),
    );
    expect(viewer).not.toContain('data-map-jump-prompt');
  });

  it('keeps a pending resolution answerable from the opened card', () => {
    const connectionId = 'c1' as Id<'mapConnections'>;
    const pending = detail({
      connectionId,
      fromSignatureId: 'ABC-123',
      wormholeTypeCode: 'K162',
      destinationProvenance: 'assumed',
      pendingCandidates: [connectionId],
    });
    const markup = renderToStaticMarkup(
      createElement(ConnectionAuthoringOverlay, {
        mapId: 'map-a',
        canEdit: true,
        connectionDetails: new Map([[connectionId, pending]]),
        unresolvedHoles: [],
        connectionPresentationNow: NOW,
        events: [],
        authoring: authoring(),
        selectedConnectionId: connectionId,
        onSelectedConnectionIdChange: vi.fn(),
      }),
    );
    expect(markup).toContain('data-has-resolution="true"');

    const settled = renderToStaticMarkup(
      createElement(ConnectionAuthoringOverlay, {
        mapId: 'map-a',
        canEdit: true,
        connectionDetails: new Map([
          [connectionId, detail({ connectionId })],
        ]),
        unresolvedHoles: [],
        connectionPresentationNow: NOW,
        events: [],
        authoring: authoring(),
        selectedConnectionId: connectionId,
        onSelectedConnectionIdChange: vi.fn(),
      }),
    );
    expect(settled).toContain('data-has-resolution="false"');
  });

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
    // Delivered: dismiss fires, no failure toast.
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

    // Lost race / transport failure: prompt stays, the user is told.
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

    // Clearing the code never notifies.
    postJump.mockClear();
    api.setConnectionWormholeType.mockResolvedValueOnce({ changed: true } as never);
    await applyWormholeType({
      mapId: 'map-a',
      connection,
      value: null,
      authoring: api,
    });
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
});
