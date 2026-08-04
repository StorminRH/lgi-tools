import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import {
  ConnectionFields,
  decodeOptionalField,
  encodeOptionalField,
  UNSET_FIELD,
} from './connection-fields';

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
  Button: (props: {
    children?: unknown;
    'data-map-connection-sever'?: string;
    'data-map-connection-restore'?: string;
  }) =>
    createElement(
      'button',
      {
        'data-map-connection-sever': props['data-map-connection-sever'],
        'data-map-connection-restore': props['data-map-connection-restore'],
      },
      props.children as never,
    ),
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
  wormholeTypeCode: 'B274',
  massState: null,
  shipSize: 'M' as const,
  lifeStage: 'under_1_day' as const,
  lifeStageObservedAt: 1,
  deathEarliestAt: null,
  deathLatestAt: null,
  deletedAt: null,
  purgeAfter: null,
};

const SETTERS = {
  setWormholeType: vi.fn(),
  setShipSize: vi.fn(),
  setMassState: vi.fn(),
  setLifeStage: vi.fn(),
};

describe('optional field encode/decode', () => {
  it('round-trips null through the unset sentinel', () => {
    expect(encodeOptionalField(null)).toBe(UNSET_FIELD);
    expect(decodeOptionalField(UNSET_FIELD)).toBeNull();
    expect(decodeOptionalField('B274')).toBe('B274');
  });
});

describe('connection fields form', () => {
  it('wires type search and dropdowns including unset stability', () => {
    const markup = renderToStaticMarkup(
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

    expect(markup).toContain('data-map-connection-fields');
    expect(markup).toContain('data-terminal-search');
    expect(markup).toContain('data-initial="B274"');
    expect(markup).toContain('data-select="Mass stability"');
    expect(markup).toContain(`data-value="${UNSET_FIELD}"`);
    expect(markup).toContain('data-select="Ship size"');
    expect(markup).toContain('data-value="M"');
    expect(markup).toContain('data-select="Life stage"');
  });

  it('locks codex-owned size and shows the read-only panel for typed holes (HC-1)', () => {
    const markup = renderToStaticMarkup(
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

    expect(markup).toContain('data-map-connection-codex');
    expect(markup).toContain('data-map-codex-fact="Total mass"');
    expect(markup).toContain('data-map-connection-size-locked');
    expect(markup).toContain('>L<');
    expect(markup).not.toContain('data-select="Ship size"');
    expect(markup).toContain('data-map-connection-mass-range');
    expect(markup).toContain('–');
    expect(markup).toContain('data-map-connection-sever');
  });

  it('keeps the editable ship-size select for K162 / untyped connections', () => {
    const markup = renderToStaticMarkup(
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

    expect(markup).not.toContain('data-map-connection-codex');
    expect(markup).toContain('data-select="Ship size"');
    expect(markup).not.toContain('data-map-connection-size-locked');
  });

  it('opens restore-only mode without field editors or sever', () => {
    const markup = renderToStaticMarkup(
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

    expect(markup).toContain('data-map-connection-restore-mode');
    expect(markup).toContain('data-map-connection-restore');
    expect(markup).not.toContain('data-map-connection-sever');
    expect(markup).not.toContain('data-terminal-search');
    expect(markup).not.toContain('data-select="Mass stability"');
  });
});
