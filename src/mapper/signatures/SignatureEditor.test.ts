import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { ConnectionEditorDetail } from '../chain/use-map-chain';
import { editorLeader } from './editor-leader';
import { SignatureEditor } from './SignatureEditor';

vi.mock('../authoring/use-wormhole-editor-data', () => ({
  useWormholeEditorData: () => ({
    codex: null,
    codes: ['B274'],
    preferredCodes: ['B274'],
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

const CONNECTION: ConnectionEditorDetail = {
  connectionId: 'connection-1' as Id<'mapConnections'>,
  _creationTime: 1,
  fromSystemId: 31_000_001,
  toSystemId: null,
  fromSignalPct: 100,
  firstSeenAt: 1,
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
  fromSignatureId: 'ABC-123',
  toSignatureId: null,
  fromDestinationHint: null,
  toDestinationHint: null,
  destinationProvenance: null,
  pendingCandidates: null,
  observedMassKg: null,
  observedMassAtStateKg: null,
};

const SETTERS = {
  setWormholeType: vi.fn(),
  setShipSize: vi.fn(),
  setMassState: vi.fn(),
  setLifeStage: vi.fn(),
  setLeadsTo: vi.fn(),
};

function render(overrides: Partial<Parameters<typeof SignatureEditor>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(SignatureEditor, {
      connection: CONNECTION,
      setters: SETTERS,
      now: 1_000,
      mode: 'edit',
      destination: null,
      onDelete: vi.fn(),
      onRestore: vi.fn(),
      onClose: vi.fn(),
      ...overrides,
    }),
  );
}

it('parks one titled scanner-anchored window without resolution chrome', () => {
  const markup = render();
  expect(markup).toContain('data-map-window="signature-editor"');
  expect(markup).toContain('data-map-window-placement="scanner-anchored"');
  expect(markup).toContain('Signature Editor');
  expect(markup).toContain('data-map-connection-fields');
  // Not an edge-anchored follower any more — no canvas transform to ride.
  expect(markup).not.toContain('--map-window-transform');

  for (const mode of ['edit', 'restore'] as const) {
    const modeMarkup = render({ mode });
    expect(modeMarkup).not.toContain('data-map-connection-resolution');
    expect(modeMarkup).not.toContain('Auto-link');
    expect(modeMarkup).not.toContain('data-map-jump-confirm');
  }
});

it('editorLeader brackets the row, clamps landing, offsets origin, and refuses collapsed or mislaid panels', () => {
  const origin = { left: 0, top: 0 };
  const panel = { left: 200, right: 480, top: 40, bottom: 400 };

  const leader = editorLeader({
    row: { left: 10, right: 180, top: 100, bottom: 128 },
    panel,
    origin,
  });
  expect(leader).not.toBeNull();
  expect(leader?.bracket).toEqual({ x: 183, top: 100, bottom: 128 });
  expect(leader?.line).toEqual({ x1: 183, y1: 114, x2: 200, y2: 114 });

  const high = editorLeader({
    row: { left: 10, right: 180, top: 0, bottom: 8 },
    panel,
    origin,
  });
  expect(high?.line.y2).toBe(48);
  const low = editorLeader({
    row: { left: 10, right: 180, top: 900, bottom: 928 },
    panel,
    origin,
  });
  expect(low?.line.y2).toBe(392);

  const offset = editorLeader({
    row: { left: 10, right: 180, top: 100, bottom: 128 },
    panel,
    origin: { left: 20, top: 30 },
  });
  expect(offset?.bracket).toEqual({ x: 163, top: 70, bottom: 98 });
  expect(offset?.line.x2).toBe(180);

  expect(
    editorLeader({
      row: { left: 10, right: 180, top: 100, bottom: 100 },
      panel,
      origin,
    }),
  ).toBeNull();
  expect(
    editorLeader({
      row: { left: 10, right: 180, top: 100, bottom: 128 },
      panel: { left: 200, right: 480, top: 40, bottom: 40 },
      origin,
    }),
  ).toBeNull();
  expect(
    editorLeader({
      row: { left: 10, right: 180, top: 100, bottom: 128 },
      panel: { left: 20, right: 190, top: 40, bottom: 400 },
      origin,
    }),
  ).toBeNull();

  const squeezed = editorLeader({
    row: { left: 10, right: 180, top: 100, bottom: 102 },
    panel,
    origin,
  });
  expect(squeezed?.bracket.bottom).toBe(110);
});
