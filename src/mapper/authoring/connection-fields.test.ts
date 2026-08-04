import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
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

const CONNECTION = {
  connectionId: 'c1' as Id<'mapConnections'>,
  fromSystemId: 30_000_142,
  toSystemId: 30_002_187,
  wormholeTypeCode: 'B274',
  massState: null,
  shipSize: 'M' as const,
  lifeStage: 'under_1_day' as const,
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
        codes: ['B274', 'K162'],
        setters: {
          setWormholeType: vi.fn(),
          setShipSize: vi.fn(),
          setMassState: vi.fn(),
          setLifeStage: vi.fn(),
        },
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
    expect(markup).toContain('data-options');
    expect(markup).toContain(UNSET_FIELD);
  });
});
