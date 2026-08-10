import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import {
  decodeOptionalField,
  encodeOptionalField,
  UNSET_FIELD,
} from './connection-field-group';
import { ConnectionFields } from './connection-fields';

vi.mock('@/components/ui/select', () => ({
  Select: (props: {
    ariaLabel: string;
    value: string;
    items: readonly { value: string; label: string }[];
  }) =>
    createElement('div', {
      'data-select': props.ariaLabel,
      'data-value': props.value,
      'data-options': props.items.map((item) => item.value).join(','),
    }),
}));

vi.mock('@/components/ui/terminal-search', () => ({
  TerminalSearch: (props: { initialValue: string; placeholder?: string }) =>
    createElement('div', {
      'data-terminal-search': '',
      'data-initial': props.initialValue,
      'data-placeholder': props.placeholder ?? '',
    }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: Record<string, unknown> & { children?: unknown }) =>
    createElement('button', props, children as never),
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: (props: { children?: unknown; content?: unknown }) =>
    createElement('div', { 'data-tooltip': '' }, props.children as never),
}));

const TYPED: WormholeCodexEntry = {
  code: 'B274',
  typeId: 1,
  farSide: false,
  totalMass: 2_000_000_000,
  maxJumpMass: 375_000_000,
  massRegen: 0,
  lifetimeMinutes: 960,
  sizeClass: 'L',
  targetClass: 7,
};

const K162: WormholeCodexEntry = {
  code: 'K162',
  typeId: 2,
  farSide: true,
};

const CONNECTION = {
  connectionId: 'c1' as Id<'mapConnections'>,
  _creationTime: 1,
  fromSystemId: 30_000_142,
  toSystemId: 30_002_187,
  fromSignalPct: null,
  firstSeenAt: null,
  wormholeTypeCode: 'B274',
  typedSide: 'from' as const,
  massState: null,
  shipSize: 'M' as const,
  lifeStage: 'under_1_day' as const,
  lifeStageObservedAt: 1,
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

const SETTERS = {
  setWormholeType: vi.fn(),
  setShipSize: vi.fn(),
  setMassState: vi.fn(),
  setLifeStage: vi.fn(),
  setTypedSide: vi.fn(),
  setDestinationHint: vi.fn(),
};

describe('optional field encode/decode', () => {
  it('round-trips null through the unset sentinel', () => {
    expect(encodeOptionalField(null)).toBe(UNSET_FIELD);
    expect(decodeOptionalField(UNSET_FIELD)).toBeNull();
    expect(decodeOptionalField('B274')).toBe('B274');
  });
});

describe('connection fields form', () => {
  it('wires edit-mode fields, locks typed size, and gates leads-to plus regen rows', () => {
    const base = renderToStaticMarkup(
      createElement(ConnectionFields, {
        connection: CONNECTION,
        codexReady: true,
        codes: ['B274', 'K162'],
        entry: null,
        now: 1,
        mode: 'edit',
        setters: SETTERS,
      }),
    );
    expect(base).toContain('data-map-connection-fields');
    expect(base).toContain('data-terminal-search');
    expect(base).toContain('data-initial="B274"');
    expect(base).toContain('data-select="Mass stability"');
    expect(base).toContain(`data-value="${UNSET_FIELD}"`);
    expect(base).toContain('data-select="Ship size"');
    expect(base).toContain('data-value="M"');
    expect(base).toContain('data-select="Life stage"');

    const typed = renderToStaticMarkup(
      createElement(ConnectionFields, {
        connection: CONNECTION,
        codexReady: true,
        codes: ['B274'],
        entry: TYPED,
        now: 1,
        mode: 'edit',
        onSever: vi.fn(),
        setters: SETTERS,
      }),
    );
    expect(typed).toContain('data-map-connection-codex');
    expect(typed).toContain('data-map-codex-fact="Total mass"');
    expect(typed).toContain('data-map-connection-size-locked');
    expect(typed).toContain('>L<');
    expect(typed).not.toContain('data-select="Ship size"');
    expect(typed).toContain('data-map-connection-mass-range');
    expect(typed).toContain('–');
    expect(typed).toContain('data-map-connection-sever');
    expect(typed).not.toContain('data-select="Leads to"');
    expect(typed).not.toContain('data-map-codex-fact="Regeneration"');

    const k162 = renderToStaticMarkup(
      createElement(ConnectionFields, {
        connection: { ...CONNECTION, wormholeTypeCode: 'K162', shipSize: null },
        codexReady: true,
        codes: ['K162'],
        entry: K162,
        now: 1,
        mode: 'edit',
        setters: SETTERS,
      }),
    );
    expect(k162).not.toContain('data-map-connection-codex');
    expect(k162).toContain('data-select="Ship size"');
    expect(k162).not.toContain('data-map-connection-size-locked');
    expect(k162).toContain('data-select="Origin leads to"');
    expect(k162).toContain('data-select="Far side leads to"');

    const untyped = renderToStaticMarkup(
      createElement(ConnectionFields, {
        connection: { ...CONNECTION, wormholeTypeCode: null },
        codexReady: true,
        codes: [],
        entry: null,
        now: 1,
        mode: 'edit',
        setters: SETTERS,
      }),
    );
    expect(untyped).toContain('data-select="Origin leads to"');
    expect(untyped).toContain('data-select="Far side leads to"');

    const regen = renderToStaticMarkup(
      createElement(ConnectionFields, {
        connection: CONNECTION,
        codexReady: true,
        codes: ['B274'],
        entry: { ...TYPED, massRegen: 500_000_000 },
        now: 1,
        mode: 'edit',
        setters: SETTERS,
      }),
    );
    expect(regen).toContain('data-map-codex-fact="Regeneration"');
    expect(regen).toContain('data-map-connection-mass-regen');
  });

  it('shows answerable auto-link controls when supplied and opens restore-only mode without editors', () => {
    const pending = renderToStaticMarkup(
      createElement(ConnectionFields, {
        connection: {
          ...CONNECTION,
          wormholeTypeCode: 'K162',
          destinationProvenance: 'assumed' as const,
          pendingCandidates: [CONNECTION.connectionId],
        },
        codexReady: true,
        codes: ['K162'],
        entry: K162,
        now: 1,
        mode: 'edit',
        setters: SETTERS,
        resolutionControls: {
          resolution: {
            connectionId: CONNECTION.connectionId,
            candidates: [
              {
                connectionId: CONNECTION.connectionId,
                signatureId: 'ABC-123',
                wormholeTypeCode: 'K162',
                isCurrent: true,
              },
              {
                connectionId: 'stub-2' as Id<'mapConnections'>,
                signatureId: 'DEF-456',
                wormholeTypeCode: null,
                isCurrent: false,
              },
            ],
          },
          answers: { onConfirm: vi.fn(), onCorrect: vi.fn() },
        },
      }),
    );
    expect(pending).toContain('data-map-connection-resolution');
    expect(pending).toContain('data-map-jump-confirm');
    expect(pending).toContain('data-map-jump-correct="stub-2"');
    expect(pending).toContain('DEF-456');

    const plain = renderToStaticMarkup(
      createElement(ConnectionFields, {
        connection: CONNECTION,
        codexReady: true,
        codes: ['B274'],
        entry: TYPED,
        now: 1,
        mode: 'edit',
        setters: SETTERS,
      }),
    );
    expect(plain).not.toContain('data-map-connection-resolution');

    const restore = renderToStaticMarkup(
      createElement(ConnectionFields, {
        connection: {
          ...CONNECTION,
          deletedAt: 100,
          purgeAfter: 100 + 24 * 60 * 60 * 1000,
        },
        codexReady: true,
        codes: ['B274'],
        entry: TYPED,
        now: 200,
        mode: 'restore',
        onRestore: vi.fn(),
        setters: SETTERS,
      }),
    );
    expect(restore).toContain('data-map-connection-restore-mode');
    expect(restore).toContain('data-map-connection-restore');
    expect(restore).not.toContain('data-map-connection-sever');
    expect(restore).not.toContain('data-terminal-search');
    expect(restore).not.toContain('data-select="Mass stability"');
  });
});
