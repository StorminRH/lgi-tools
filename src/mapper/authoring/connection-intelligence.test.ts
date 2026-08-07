import { describe, expect, it } from 'vitest';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import type { Id } from '@/data/convex/data-model';
import {
  codexPanelFacts,
  formatDurationBound,
  formatKilograms,
  isCodexSizeLocked,
  lifetimeRowDisplay,
  massRowDisplay,
} from './connection-intelligence';

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

const REGEN: WormholeCodexEntry = {
  ...TYPED,
  code: 'A239',
  massRegen: 500_000_000,
};

const K162: WormholeCodexEntry = {
  code: 'K162',
  typeId: 2,
  farSide: true,
};

const CONNECTION = {
  connectionId: 'c1' as Id<'mapConnections'>,
  _creationTime: 1_000,
  fromSystemId: 30_000_142,
  toSystemId: 30_002_187,
  wormholeTypeCode: 'B274',
  massState: 'stable' as const,
  shipSize: 'M' as const,
  lifeStage: 'under_1_day' as const,
  lifeStageObservedAt: 1_000,
  deathEarliestAt: null as number | null,
  deathLatestAt: null as number | null,
  deletedAt: null,
  purgeAfter: null,
};

describe('connection intelligence', () => {
  it('locks typed size, bounds mass with travel anchors, and projects lifetime ceilings', () => {
    expect(isCodexSizeLocked(TYPED)).toBe(true);
    expect(isCodexSizeLocked(K162)).toBe(false);
    expect(isCodexSizeLocked(null)).toBe(false);
    expect(codexPanelFacts(TYPED)?.sizeClass).toBe('L');
    expect(codexPanelFacts(K162)).toBeNull();

    const stable = massRowDisplay(TYPED, 'stable', null, null);
    expect(stable.kind).toBe('range');
    if (stable.kind !== 'range') return;
    expect(stable.label).toContain('–');
    expect(stable.label).toContain('±10%');
    expect(stable.minKg).toBeLessThan(stable.maxKg);

    expect(massRowDisplay(REGEN, 'stable', null, null)).toEqual({
      kind: 'regenerates',
      label: 'Regenerates — no mass interval',
    });
    expect(massRowDisplay(K162, 'stable', null, null).kind).toBe('none');
    expect(formatKilograms(2_000_000_000)).toBe('2B kg');

    const travelled = massRowDisplay(TYPED, 'stable', 500_000_000, 200_000_000);
    expect(travelled.kind).toBe('range');
    if (travelled.kind !== 'range') return;
    expect(travelled.minKg).toBe(stable.minKg - 300_000_000);
    expect(travelled.maxKg).toBe(stable.maxKg - 300_000_000);
    expect(massRowDisplay(TYPED, 'stable', 100_000_000, 200_000_000).kind).toBe(
      'none',
    );

    const ceiling = lifetimeRowDisplay(CONNECTION, TYPED, 1_000);
    expect(ceiling.kind).toBe('ceiling');
    if (ceiling.kind === 'ceiling') {
      expect(ceiling.label.startsWith('≤ ')).toBe(true);
    }

    const ranged = lifetimeRowDisplay(
      {
        ...CONNECTION,
        deathEarliestAt: 1_000 + 4 * 60 * 60 * 1000,
        deathLatestAt: 1_000 + 16 * 60 * 60 * 1000,
      },
      TYPED,
      1_000,
    );
    expect(ranged.kind).toBe('range');
    if (ranged.kind === 'range') {
      expect(ranged.label).toContain('–');
      expect(ranged.title).toContain('remaining');
    }

    expect(
      lifetimeRowDisplay(
        {
          ...CONNECTION,
          deathEarliestAt: 500,
          deathLatestAt: 900,
        },
        TYPED,
        1_000,
      ),
    ).toEqual({ kind: 'expired', label: 'Expired' });
    expect(formatDurationBound(90 * 60 * 1000)).toBe('1.5h');
  });
});
