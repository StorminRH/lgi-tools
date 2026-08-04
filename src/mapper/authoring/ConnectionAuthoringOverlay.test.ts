import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { ConnectionDetail } from '../chain/use-map-chain';
import {
  ConnectionAuthoringOverlay,
  severAndAnnounce,
} from './ConnectionAuthoringOverlay';

const announce = vi.hoisted(() => vi.fn());

vi.mock('./sever-toast', () => ({
  announceSeverOutcome: announce,
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
  }) =>
    createElement('div', {
      'data-map-connection-details': '',
      'data-mode': props.mode,
      'data-connection-id': props.connection.connectionId,
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
    ...partial,
  };
}

function authoring() {
  return {
    setConnectionWormholeType: vi.fn(),
    setConnectionShipSize: vi.fn(),
    setConnectionMassState: vi.fn(),
    setConnectionLifeStage: vi.fn(),
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
        connectionPresentationNow: NOW,
        events: [],
        authoring: authoring(),
        selectedConnectionId: connectionId,
        onSelectedConnectionIdChange: vi.fn(),
      }),
    );
    expect(markup).not.toContain('data-map-connection-details');
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
