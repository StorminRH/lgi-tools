import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { ConnectionEditorDetail } from '../chain/use-map-chain';
import { editorLeader } from './editor-leader';
import { measureEditorLeader } from './ScannerAnchoredPanel';
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
    pendingResolutionCharacterId: null,
  observedMassKg: null,
  observedMassAtStateKg: null,
};

const SETTERS = {
  setWormholeType: vi.fn(),
  setShipSize: vi.fn(),
  setMassState: vi.fn(),
  setLifeStage: vi.fn(),
  setLeadsTo: vi.fn(),
  setDestination: vi.fn(),
  linkToOrigin: vi.fn(),
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
  expect(markup).not.toContain('--map-window-transform');

  for (const mode of ['edit', 'restore'] as const) {
    const modeMarkup = render({ mode });
    expect(modeMarkup).not.toContain('data-map-connection-resolution');
    expect(modeMarkup).not.toContain('Auto-link');
    expect(modeMarkup).not.toContain('data-map-jump-confirm');
  }
});

it('editorLeader brackets, clamps, clips, and measureEditorLeader delegates when boxes exist', () => {
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

  const clip = { left: 0, right: 200, top: 80, bottom: 200 };
  const clipped = editorLeader({
    row: { left: 10, right: 180, top: 60, bottom: 120 },
    panel,
    origin,
    clip,
  });
  expect(clipped?.bracket).toEqual({ x: 183, top: 80, bottom: 120 });
  expect(
    editorLeader({
      row: { left: 10, right: 180, top: 0, bottom: 40 },
      panel,
      origin,
      clip,
    }),
  ).toBeNull();

  expect(measureEditorLeader(null, null, null)).toBeNull();
  const box = (rect: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }) => ({
    getBoundingClientRect: () => rect as DOMRect,
  });
  const layer = box({ left: 0, right: 800, top: 0, bottom: 600 });
  const panelEl = box({ left: 200, right: 480, top: 40, bottom: 400 });
  const row = {
    ...box({ left: 10, right: 180, top: 100, bottom: 128 }),
    closest: () => null,
  };
  expect(measureEditorLeader(layer, panelEl, row)?.bracket).toEqual({
    x: 183,
    top: 100,
    bottom: 128,
  });
  const selectors: string[] = [];
  const clippedRow = {
    ...box({ left: 10, right: 180, top: 60, bottom: 120 }),
    closest: (selector: string) => {
      selectors.push(selector);
      return box({ left: 0, right: 200, top: 80, bottom: 200 });
    },
  };
  expect(measureEditorLeader(layer, panelEl, clippedRow)?.bracket).toEqual({
    x: 183,
    top: 80,
    bottom: 120,
  });
  expect(selectors).toEqual(['[data-scanner-scroll]']);
});
