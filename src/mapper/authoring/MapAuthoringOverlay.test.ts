import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MapAuthoringOverlay } from './MapAuthoringOverlay';

vi.mock('../log/MapEventLog', () => ({
  MapEventLog: (props: { canEdit: boolean; mapId: string; now: number }) =>
    createElement('div', {
      'data-map-event-log': '',
      'data-can-edit': props.canEdit ? 'true' : 'false',
      'data-map-id': props.mapId,
      'data-now': props.now,
    }),
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
});
