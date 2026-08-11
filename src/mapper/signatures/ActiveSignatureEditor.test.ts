import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/use-map-chain';
import { ActiveSignatureEditor } from './ActiveSignatureEditor';
import { destinationReadout } from './system-readout';

const assets = vi.hoisted(() => ({ systemInfo: vi.fn(() => null) }));

vi.mock('../chain/use-map-chain', () => ({
  useUniverseAssets: () => ({ systemInfo: assets.systemInfo }),
}));

vi.mock('../authoring/use-wormhole-editor-data', () => ({
  useWormholeEditorData: () => ({
    codex: null,
    codes: ['B274'],
    preferredCodes: [],
    entry: null,
    codexReady: true,
  }),
}));

vi.mock('@/components/ui/select', () => ({
  Select: (props: { ariaLabel: string }) =>
    createElement('div', { 'data-select': props.ariaLabel }),
}));

vi.mock('@/components/ui/terminal-search', () => ({
  TerminalSearch: () => createElement('div', { 'data-terminal-search': '' }),
}));

vi.mock('../jump-client', () => ({ postJumpRequest: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('../authoring/sever-toast', () => ({ announceSeverOutcome: vi.fn() }));

const NOW = 100_000;
const UNDO_MS = 24 * 60 * 60 * 1000;

const RESOLVED_ID = 'resolved-1' as Id<'mapConnections'>;
const STUB_ID = 'stub-1' as Id<'mapConnections'>;

function base() {
  return {
    _creationTime: 1,
    fromSystemId: 31_000_001,
    fromSignalPct: null,
    firstSeenAt: null,
    wormholeTypeCode: null,
    typedSide: null,
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
    toDestinationHint: null,
    destinationProvenance: null,
    pendingCandidates: null,
    observedMassKg: null,
    observedMassAtStateKg: null,
  };
}

const RESOLVED: ConnectionDetail = {
  ...base(),
  connectionId: RESOLVED_ID,
  toSystemId: 31_000_002,
};

const STUB: UnresolvedHoleSummary = {
  ...base(),
  connectionId: STUB_ID,
  toSystemId: null,
  fromSignatureId: 'ABC-123',
};

function authoring() {
  return {
    setConnectionWormholeType: vi.fn(),
    setConnectionShipSize: vi.fn(),
    setConnectionMassState: vi.fn(),
    setConnectionLifeStage: vi.fn(),
    setConnectionDestinationHint: vi.fn(),
    severConnection: vi.fn(),
    restoreSeveredBranch: vi.fn(),
    restoreConnection: vi.fn(),
    restoreSignatures: vi.fn(),
  };
}

function render(
  connectionId: Id<'mapConnections'> | null,
  overrides: {
    readonly details?: readonly ConnectionDetail[];
    readonly holes?: readonly UnresolvedHoleSummary[];
    readonly onClose?: () => void;
  } = {},
): string {
  const details = overrides.details ?? [RESOLVED];
  return renderToStaticMarkup(
    createElement(ActiveSignatureEditor, {
      mapId: 'map-a',
      connectionId,
      connectionDetails: new Map(
        details.map((row) => [String(row.connectionId), row]),
      ),
      unresolvedHoles: overrides.holes ?? [STUB],
      authoring: authoring(),
      now: NOW,
      onClose: overrides.onClose ?? vi.fn(),
    }),
  );
}

describe('ActiveSignatureEditor', () => {
  it('mounts nothing until a connection is named', () => {
    expect(render(null)).toBe('');
  });

  it('opens the editor for a resolved connection', () => {
    const markup = render(RESOLVED_ID);
    expect(markup).toContain('data-map-window="signature-editor"');
    expect(markup).toContain('Signature Editor');
    expect(markup).toContain('data-map-connection-mode="edit"');
    expect(markup).toContain('data-map-connection-delete');
  });

  it('opens the editor for an unresolved scanned hole from the same seam', () => {
    const markup = render(STUB_ID);
    expect(markup).toContain('data-map-window="signature-editor"');
    expect(markup).toContain('data-map-connection-mode="edit"');
    // No destination yet: Leads to stays the human hint dropdown.
    expect(markup).toContain('data-select="Leads to"');
    expect(markup).not.toContain('data-map-connection-leads-locked');
  });

  it('opens restore mode inside the undo window', () => {
    const dying: ConnectionDetail = {
      ...RESOLVED,
      deletedAt: NOW - 1_000,
      purgeAfter: NOW + UNDO_MS,
    };
    const markup = render(RESOLVED_ID, { details: [dying] });
    expect(markup).toContain('data-map-connection-mode="restore"');
    expect(markup).toContain('data-map-connection-restore');
    expect(markup).not.toContain('data-map-connection-delete');
  });

  it('closes rather than freezing a copy of a row that left the feed', () => {
    const gone = render('missing' as Id<'mapConnections'>);
    expect(gone).toBe('');

    const skeleton: ConnectionDetail = {
      ...RESOLVED,
      deletedAt: NOW - 1_000,
      purgeAfter: null,
    };
    expect(render(RESOLVED_ID, { details: [skeleton] })).toBe('');
  });

  it('locks Leads to onto the destination identity readout', () => {
    assets.systemInfo.mockReturnValue({
      id: 31_000_002,
      name: 'J123456',
      security: -1,
      whClassId: 4,
    } as unknown as null);
    const markup = render(RESOLVED_ID);
    expect(markup).toContain('data-map-connection-leads-locked');
    expect(markup).toContain('J123456 - C4');
    assets.systemInfo.mockReturnValue(null);
  });
});

describe('destinationReadout', () => {
  const directory = (entry: SystemDirectoryEntry | null) => () => entry;

  it('is null while the hole is unresolved', () => {
    expect(destinationReadout(null, directory(null))).toBeNull();
  });

  it('renders the shared identity rule for a known system', () => {
    expect(
      destinationReadout(
        31_000_002,
        directory({
          id: 31_000_002,
          name: 'J123456',
          security: -1,
          whClassId: 4,
        } as SystemDirectoryEntry),
      ),
    ).toEqual({ label: 'J123456 - C4', tone: 'text-wh-c4' });
  });

  it('falls back to the bare id before the directory lands', () => {
    expect(destinationReadout(31_000_002, null)).toEqual({
      label: '31000002',
      tone: 'text-name',
    });
  });
});
