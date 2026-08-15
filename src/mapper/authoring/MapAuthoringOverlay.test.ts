import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MapAuthoringOverlay } from './MapAuthoringOverlay';

vi.mock('../log/MapEventLog', () => ({
  MapEventLog: (props: { canEdit: boolean; events: readonly unknown[] }) =>
    createElement('div', {
      'data-map-event-log': '',
      'data-can-edit': props.canEdit ? 'true' : 'false',
      'data-event-count': String(props.events.length),
    }),
}));

function authoring() {
  return {
    setConnectionWormholeType: vi.fn(),
    setConnectionShipSize: vi.fn(),
    setConnectionMassState: vi.fn(),
    setConnectionLifeStage: vi.fn(),
    setConnectionDestinationHint: vi.fn(),
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
        events: [],
        authoring: authoring(),
      }),
    );
    expect(markup).toContain('data-map-event-log');
    expect(markup).not.toContain('data-signature-jump-prompt');
    expect(markup).not.toContain('data-map-connection-fields');
  });
});
