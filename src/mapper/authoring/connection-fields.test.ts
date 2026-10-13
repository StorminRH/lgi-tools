import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import {
  decodeOptionalField,
  encodeOptionalField,
  UNSET_FIELD,
} from './connection-field-group';
import { blankDoor } from '@/data/maps/connection-hallway';
import { withHostNumberLocale } from '@/lib/__tests__/host-locale';
import { connectionEditorFixture } from '../chain/__tests__/connection-editor-fixture';
import { ConnectionFields } from './connection-fields';

const selectHandlers = new Map<string, (next: string) => void>();

vi.mock('@/components/ui/select', () => ({
  Select: (props: {
    ariaLabel: string;
    value: string;
    items: readonly { value: string; label: string }[];
    onValueChange?: (next: string) => void;
  }) => {
    if (props.onValueChange !== undefined) {
      selectHandlers.set(props.ariaLabel, props.onValueChange);
    }
    return createElement('div', {
      'data-select': props.ariaLabel,
      'data-value': props.value,
      'data-options': props.items.map((item) => item.value).join(','),
      'data-labels': props.items.map((item) => item.label).join('|'),
    });
  },
}));

vi.mock('@/components/ui/terminal-search', () => ({
  TerminalSearch: (props: { initialValue: string; placeholder?: string }) =>
    createElement('div', {
      'data-terminal-search': '',
      'data-initial': props.initialValue,
      'data-placeholder': props.placeholder ?? '',
    }),
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

const CONNECTION = connectionEditorFixture({
  connectionId: 'c1' as Id<'mapConnections'>,
  fromSystemId: 30_000_142,
  toSystemId: 30_002_187,
  from: { ...blankDoor(), typeCode: 'B274' },
  to: { ...blankDoor(), typeCode: 'K162' },
  identity: { kind: 'typed', provenance: 'human' },
  shipSize: 'M',
  lifetime: { kind: 'stage', lifeStage: 'under_1_day', observedAt: 1 },
});

const SETTERS = {
  setWormholeType: vi.fn(),
  setShipSize: vi.fn(),
  setMassState: vi.fn(),
  setLifeStage: vi.fn(),
  setLeadsTo: vi.fn(),
  setDestination: vi.fn(),
  linkToOrigin: vi.fn(),
};

function expectInOrder(markup: string, needles: readonly string[]): void {
  const positions = needles.map((needle) => markup.indexOf(needle));
  expect(positions.every((position) => position >= 0)).toBe(true);
  for (const [index, position] of positions.entries()) {
    if (index === 0) continue;
    expect(position).toBeGreaterThan(positions[index - 1] as number);
  }
}

it('round-trips null through the unset sentinel', () => {
  expect(encodeOptionalField(null)).toBe(UNSET_FIELD);
  expect(decodeOptionalField(UNSET_FIELD)).toBeNull();
  expect(decodeOptionalField('B274')).toBe('B274');
});

it('renders the six ruling fields with in-game wording and no retired controls', () => {
  const markup = renderToStaticMarkup(
    createElement(ConnectionFields, {
      connection: { ...CONNECTION, toSystemId: null, shipSize: null },
      codes: ['B274', 'K162'],
      entry: TYPED,
      now: 1,
      mode: 'edit',
      setters: SETTERS,
      onDelete: vi.fn(),
    }),
  );
  expectInOrder(markup, [
    'Wormhole type',
    'data-map-connection-codex',
    '>Size<',
    '>Mass<',
    'Reliable Lifetime',
    'Leads to',
    'data-map-connection-delete',
  ]);

  expect(markup).toContain('data-select="Mass"');
  expect(markup).toContain('data-options=",stable,reduced,critical"');
  expect(markup).toContain(
    'data-labels="Unset|More than 50% remaining|Less than 50% remaining|Less than 10% remaining"',
  );
  expect(markup).toContain('data-select="Reliable Lifetime"');
  expect(markup).toContain(
    'data-options=",under_1_day,under_4_hours,under_1_hour,expired"',
  );
  expect(markup).toContain(
    'data-labels="Unset|Less than 1 day remaining|Less than 4 hours remaining|Less than 1 hour remaining|Expired, closure imminent"',
  );

  const retired = renderToStaticMarkup(
    createElement(ConnectionFields, {
      connection: { ...CONNECTION, toSystemId: null },
      codes: ['B274', 'K162'],
      entry: K162,
      now: 1,
      mode: 'edit',
      setters: SETTERS,
    }),
  );
  expect(retired).not.toContain('Typed side');
  expect(retired).not.toContain('Origin');
  expect(retired).not.toContain('Far side');
  expect(retired).not.toContain('Auto-link');
  expect(retired).not.toContain('data-map-connection-resolution');
  expect(retired.split('data-select="Leads to"')).toHaveLength(2);
});

it('groups codex kilograms in en-US under any host locale', () => {
  const markup = withHostNumberLocale('de-DE', () =>
    renderToStaticMarkup(
      createElement(ConnectionFields, {
        connection: { ...CONNECTION, toSystemId: null },
        codes: ['B274'],
        entry: { ...TYPED, massRegen: 500_000_000 },
        now: 1,
        mode: 'edit',
        setters: SETTERS,
      }),
    ),
  );
  expect(markup).toMatch(/data-map-codex-fact="Total mass"[^>]*>2,000,000,000 kg</);
  expect(markup).toMatch(/data-map-codex-fact="Jump mass"[^>]*>375,000,000 kg</);
  expect(markup).toMatch(/data-map-codex-fact="Regeneration"[^>]*>500,000,000 kg</);
});

it('locks type-derived size and Leads to, and offers Delete vs Restore by mode', () => {
  const typed = renderToStaticMarkup(
    createElement(ConnectionFields, {
      connection: { ...CONNECTION, toSystemId: null },
      codes: ['B274'],
      entry: TYPED,
      now: 1,
      mode: 'edit',
      setters: SETTERS,
    }),
  );
  expect(typed).toContain('data-map-connection-codex');
  expect(typed).toContain('data-map-codex-fact="Total mass"');
  expect(typed).toContain('data-map-codex-fact="Jump mass"');
  expect(typed).toContain('data-map-codex-fact="Lifetime"');
  expect(typed).not.toContain('data-map-codex-fact="Size"');
  expect(typed).not.toContain('>Codex<');
  expect(typed).toContain('data-map-connection-size-locked');
  expect(typed).not.toContain('data-select="Size"');
  expect(typed).toContain('data-map-connection-mass-range');
  expect(typed).toMatch(/data-map-connection-mass-range=""[^>]*>0 kg–2.2B kg remaining</);
  expect(typed).toMatch(/data-lifetime-kind="ceiling"[^>]*>≤ \d+h remaining</);
  expect(typed).not.toContain('data-map-codex-fact="Regeneration"');

  const k162 = renderToStaticMarkup(
    createElement(ConnectionFields, {
      connection: {
        ...CONNECTION,
        toSystemId: null,
        from: { ...blankDoor(), typeCode: 'K162' },
        shipSize: null,
      },
      codes: ['K162'],
      entry: K162,
      now: 1,
      mode: 'edit',
      setters: SETTERS,
    }),
  );
  expect(k162).not.toContain('data-map-connection-codex');
  expect(k162).toContain('data-select="Size"');
  expect(k162).not.toContain('data-map-connection-size-locked');

  const regen = renderToStaticMarkup(
    createElement(ConnectionFields, {
      connection: { ...CONNECTION, toSystemId: null },
      codes: ['B274'],
      entry: { ...TYPED, massRegen: 500_000_000 },
      now: 1,
      mode: 'edit',
      setters: SETTERS,
    }),
  );
  expect(regen).toContain('data-map-codex-fact="Regeneration"');
  expect(regen).toContain('data-map-connection-mass-regen');

  const resolved = renderToStaticMarkup(
    createElement(ConnectionFields, {
      connection: CONNECTION,
      codes: ['B274'],
      entry: TYPED,
      now: 1,
      mode: 'edit',
      setters: SETTERS,
      destination: { label: 'J123456 - C4', tone: 'text-wh-c4' },
    }),
  );
  expect(resolved).not.toContain('data-map-connection-leads-locked');
  expect(resolved).toContain('J123456 - C4');
  expect(resolved).toContain('data-placeholder="Search systems"');
  expect(resolved).not.toContain('data-select="Leads to"');

  const unresolved = renderToStaticMarkup(
    createElement(ConnectionFields, {
      connection: { ...CONNECTION, toSystemId: null },
      codes: ['B274'],
      entry: TYPED,
      now: 1,
      mode: 'edit',
      setters: SETTERS,
      destination: null,
    }),
  );
  expect(unresolved).toContain('data-select="Leads to"');
  expect(unresolved).not.toContain('data-map-connection-leads-locked');

  const withOrigin = renderToStaticMarkup(
    createElement(ConnectionFields, {
      connection: { ...CONNECTION, toSystemId: null },
      codes: ['B274'],
      entry: TYPED,
      now: 1,
      mode: 'edit',
      setters: SETTERS,
      originLeads: [{
        connectionId: 'inbound-1',
        label: 'J160650 - C3',
        systemId: 31_000_002,
      }],
    }),
  );
  expect(withOrigin).toContain('data-select="Leads to"');
  expect(withOrigin).toContain('origin:inbound-1');
  expect(withOrigin).toContain('J160650 - C3');
  expect(withOrigin).not.toContain('>Origin<');

  SETTERS.linkToOrigin.mockClear();
  SETTERS.setLeadsTo.mockClear();
  const onLeadsChange = selectHandlers.get('Leads to');
  expect(onLeadsChange).toBeTypeOf('function');
  onLeadsChange?.('origin:inbound-1');
  expect(SETTERS.linkToOrigin).toHaveBeenCalledWith('inbound-1');
  expect(SETTERS.setLeadsTo).not.toHaveBeenCalled();
  SETTERS.linkToOrigin.mockClear();
  onLeadsChange?.('unknown');
  expect(SETTERS.setLeadsTo).toHaveBeenCalledWith('unknown');
  expect(SETTERS.linkToOrigin).not.toHaveBeenCalled();

  const live = renderToStaticMarkup(
    createElement(ConnectionFields, {
      connection: { ...CONNECTION, toSystemId: null },
      codes: ['B274'],
      entry: TYPED,
      now: 1,
      mode: 'edit',
      setters: SETTERS,
      onDelete: vi.fn(),
    }),
  );
  expect(live).toContain('data-map-connection-delete');
  expect(live).toContain('>Delete<');
  expect(live).not.toContain('>Sever<');
  expect(live).not.toContain('data-map-connection-restore');

  const restore = renderToStaticMarkup(
    createElement(ConnectionFields, {
      connection: {
        ...CONNECTION,
        toSystemId: null,
        tombstone: {
          kind: 'removed',
          deletedAt: 100,
          purgeAfter: 100 + 24 * 60 * 60 * 1000,
        },
      },
      codes: ['B274'],
      entry: TYPED,
      now: 200,
      mode: 'restore',
      onRestore: vi.fn(),
      setters: SETTERS,
    }),
  );
  expect(restore).toMatch(/data-map-connection-restore-mode="true"[^>]*>Connection severed\.</);
  expect(restore).toContain('data-map-connection-restore');
  expect(restore).not.toContain('data-map-connection-delete');
  expect(restore).not.toContain('data-terminal-search');
  expect(restore).not.toContain('data-select="Mass"');
  expect(restore).toContain('data-map-connection-mass-state-readout');
  expect(restore).toContain('data-map-connection-life-readout');
});

it('keeps the mass and lifetime estimates under their select or restore readout', () => {
  const edit = renderToStaticMarkup(
    createElement(ConnectionFields, {
      connection: { ...CONNECTION, toSystemId: null, massState: 'reduced' },
      codes: ['B274'],
      entry: TYPED,
      now: 1,
      mode: 'edit',
      setters: SETTERS,
      destination: null,
    }),
  );
  expectInOrder(edit, [
    '>Mass<',
    'data-select="Mass"',
    'data-map-connection-mass-range',
    '>Reliable lifetime<',
    'data-select="Reliable Lifetime"',
    'data-map-connection-lifetime',
    '>Leads to<',
  ]);

  SETTERS.setMassState.mockClear();
  SETTERS.setLifeStage.mockClear();
  selectHandlers.get('Mass')?.(UNSET_FIELD);
  selectHandlers.get('Mass')?.('critical');
  expect(SETTERS.setMassState.mock.calls).toEqual([[null], ['critical']]);
  selectHandlers.get('Reliable Lifetime')?.(UNSET_FIELD);
  selectHandlers.get('Reliable Lifetime')?.('under_1_hour');
  expect(SETTERS.setLifeStage.mock.calls).toEqual([[null], ['under_1_hour']]);

  const restore = renderToStaticMarkup(
    createElement(ConnectionFields, {
      connection: {
        ...CONNECTION,
        massState: 'reduced',
        tombstone: {
          kind: 'removed',
          deletedAt: 100,
          purgeAfter: 100 + 24 * 60 * 60 * 1000,
        },
      },
      codes: ['B274'],
      entry: TYPED,
      now: 200,
      mode: 'restore',
      onRestore: vi.fn(),
      setters: SETTERS,
      destination: { label: 'J123456 - C4', tone: 'text-wh-c4' },
    }),
  );
  expect(restore).not.toContain('data-select=');
  expect(restore).not.toContain('data-terminal-search');
  expect(restore).toMatch(
    /data-map-connection-mass-state-readout=""[^>]*>Less than 50% remaining</,
  );
  expect(restore).toMatch(
    /data-map-connection-life-readout=""[^>]*>Less than 1 day remaining</,
  );
  expect(restore).toMatch(
    /data-map-connection-leads-readout=""[^>]*>J123456 - C4</,
  );
  expectInOrder(restore, [
    'data-map-connection-mass-state-readout',
    'data-map-connection-mass-range',
    'data-map-connection-life-readout',
    'data-map-connection-lifetime',
    'data-map-connection-leads-readout',
  ]);
});
