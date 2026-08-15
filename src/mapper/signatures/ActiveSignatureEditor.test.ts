import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/use-map-chain';
import { ActiveSignatureEditor } from './ActiveSignatureEditor';
import { destinationReadout } from './system-readout';

const assets = vi.hoisted(() => ({
  systemInfo: vi.fn<(id: number) => SystemDirectoryEntry | null>(() => null),
}));

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
  Select: (props: {
    ariaLabel: string;
    items?: readonly { value: string; label: string }[];
  }) =>
    createElement('div', {
      'data-select': props.ariaLabel,
      'data-options': (props.items ?? []).map((item) => item.value).join(','),
      'data-labels': (props.items ?? []).map((item) => item.label).join('|'),
    }),
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
    toSignatureId: null,
    fromDestinationHint: null,
    toDestinationHint: null,
    destinationProvenance: null,
    pendingCandidates: null,
    pendingResolutionCharacterId: null,
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
    linkStubToResolvedConnection: vi.fn(),
    severConnection: vi.fn(),
    restoreSeveredBranch: vi.fn(),
    restoreConnection: vi.fn(),
    removeSignatures: vi.fn(),
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

it('opens edit for resolved and unresolved holes, and mounts nothing until named', () => {
  expect(render(null)).toBe('');

  const resolved = render(RESOLVED_ID);
  expect(resolved).toContain('data-map-window="signature-editor"');
  expect(resolved).toContain('Signature Editor');
  expect(resolved).toContain('data-map-connection-mode="edit"');
  expect(resolved).toContain('data-map-connection-delete');

  const stub = render(STUB_ID);
  expect(stub).toContain('data-map-window="signature-editor"');
  expect(stub).toContain('data-map-connection-mode="edit"');
  // No destination yet: Leads to stays the human hint dropdown, plus the
  // already-known inbound as a named origin pick rather than an auto-link.
  expect(stub).toContain('data-select="Leads to"');
  expect(stub).not.toContain('data-map-connection-leads-locked');
  expect(stub).toContain('origin:resolved-1');
  expect(stub).toContain('31000002');
});

it('restores inside the undo window, closes when the row left the feed, and locks Leads to', () => {
  const dying: ConnectionDetail = {
    ...RESOLVED,
    deletedAt: NOW - 1_000,
    purgeAfter: NOW + UNDO_MS,
  };
  const restore = render(RESOLVED_ID, { details: [dying] });
  expect(restore).toContain('data-map-connection-mode="restore"');
  expect(restore).toContain('data-map-connection-restore');
  expect(restore).not.toContain('data-map-connection-delete');

  expect(render('missing' as Id<'mapConnections'>)).toBe('');
  const skeleton: ConnectionDetail = {
    ...RESOLVED,
    deletedAt: NOW - 1_000,
    purgeAfter: null,
  };
  expect(render(RESOLVED_ID, { details: [skeleton] })).toBe('');

  assets.systemInfo.mockReturnValue({
    id: 31_000_002,
    name: 'J123456',
    security: -1,
    whClassId: 4,
  });
  const locked = render(RESOLVED_ID);
  expect(locked).toContain('data-map-connection-leads-locked');
  expect(locked).toContain('J123456 - C4');
  assets.systemInfo.mockReturnValue(null);
});

it('destinationReadout covers unresolved, known, and bare-id fallback', () => {
  const directory = (entry: SystemDirectoryEntry | null) => () => entry;
  expect(destinationReadout(null, directory(null))).toBeNull();
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
  expect(destinationReadout(31_000_002, null)).toEqual({
    label: '31000002',
    tone: 'text-name',
  });
});
