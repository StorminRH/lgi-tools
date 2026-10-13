import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MapEventRestoreAction } from '../log/map-event-copy';
import { MapAuthoringOverlay } from './MapAuthoringOverlay';

const h = vi.hoisted(() => ({
  onRestore: null as ((action: MapEventRestoreAction) => void) | null,
  invalidate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../log/MapEventLog', () => ({
  MapEventLog: (props: {
    canEdit: boolean;
    mapId: string;
    now: number;
    onRestore: (action: MapEventRestoreAction) => void;
  }) => {
    h.onRestore = props.onRestore;
    return createElement('div', {
      'data-map-event-log': '',
      'data-can-edit': props.canEdit ? 'true' : 'false',
      'data-map-id': props.mapId,
      'data-now': props.now,
    });
  },
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { error: h.toastError, success: vi.fn() },
}));
vi.mock('../signatures/signature-elimination-client', () => ({
  invalidateSignatureElimination: h.invalidate,
}));

function authoring() {
  return {
    setConnectionWormholeType: vi.fn(),
    setConnectionShipSize: vi.fn(),
    setConnectionMassState: vi.fn(),
    setConnectionLifeStage: vi.fn(),
    setConnectionDestinationHint: vi.fn(),
    setConnectionDestination: vi.fn(),
    linkStubToResolvedConnection: vi.fn(),
    severConnection: vi.fn(),
    restoreSeveredBranch: vi.fn(),
    restoreConnection: vi.fn(),
    removeSignatures: vi.fn(),
    restoreSignatures: vi.fn(),
  };
}

describe('MapAuthoringOverlay', () => {
  it('hosts only the map ledger after jump prompting moves to the scanner', () => {
    const markup = renderToStaticMarkup(
      createElement(MapAuthoringOverlay, {
        mapId: 'map-a',
        canEdit: true,
        connectionPresentationNow: 10_000,
        authoring: authoring(),
      }),
    );
    expect(markup).toContain('data-map-event-log');
    expect(markup).not.toContain('data-signature-jump-prompt');
    expect(markup).not.toContain('data-map-connection-fields');
  });

  it('ages the ledger from the current time even when the chain clock it is handed went stale', () => {
    vi.useFakeTimers({ now: 900_000 });
    try {
      const ledgerNow = (connectionPresentationNow: number) =>
        renderToStaticMarkup(
          createElement(MapAuthoringOverlay, {
            mapId: 'map-a',
            canEdit: true,
            connectionPresentationNow,
            authoring: authoring(),
          }),
        ).match(/data-now="(\d+)"/)?.[1];

      // The chain clock froze at mount while no connection was dying.
      expect(ledgerNow(10_000)).toBe('900000');
      // A fresher tombstone tick still wins.
      expect(ledgerNow(960_000)).toBe('960000');
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores a ledger signature event, invalidating its system, and reports a swallowed failure', async () => {
    h.invalidate.mockClear();
    h.toastError.mockClear();
    const api = authoring();
    api.restoreSignatures
      .mockResolvedValueOnce({ changed: 1 })
      .mockResolvedValueOnce(undefined);
    renderToStaticMarkup(
      createElement(MapAuthoringOverlay, {
        mapId: 'map-a',
        canEdit: true,
        connectionPresentationNow: 10_000,
        authoring: api,
      }),
    );
    const action: MapEventRestoreAction = {
      kind: 'signatures',
      systemId: 7,
      signatureIds: ['ABC-123', 'XYZ-999'],
    };

    h.onRestore?.(action);
    await vi.waitFor(() => expect(h.invalidate).toHaveBeenCalledWith('map-a', 7));
    expect(api.restoreSignatures).toHaveBeenCalledWith({
      mapId: 'map-a',
      systemId: 7,
      signatureIds: ['ABC-123', 'XYZ-999'],
    });
    expect(h.toastError).not.toHaveBeenCalled();

    h.invalidate.mockClear();
    h.onRestore?.(action);
    await vi.waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith('Restore failed', {
        id: 'signature-restore:7:ABC-123,XYZ-999',
      }),
    );
    expect(api.restoreSignatures).toHaveBeenCalledTimes(2);
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(api.restoreSeveredBranch).not.toHaveBeenCalled();
  });
});
