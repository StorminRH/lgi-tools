import { describe, expect, it } from 'vitest';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import {
  codexPanelFacts,
  formatDurationBound,
  formatKilograms,
  isCodexSizeLocked,
  lifetimeRowDisplay,
  lifetimeUpperBoundLabel,
  massRowDisplay,
  type LifetimeConnection,
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

const CONNECTION: LifetimeConnection = {
  _creationTime: 1_000,
  lifetime: { kind: 'stage', lifeStage: 'under_1_day', observedAt: 1_000 },
};

function withWindow(earliestAt: number, latestAt: number): LifetimeConnection {
  return {
    _creationTime: 1_000,
    lifetime: {
      kind: 'window',
      earliestAt,
      latestAt,
      lifeStage: 'under_1_day',
      observedAt: 1_000,
    },
  };
}

describe('connection intelligence', () => {
  it('locks typed size, bounds mass with travel anchors, and projects lifetime ceilings', () => {
    expect(isCodexSizeLocked(TYPED)).toBe(true);
    expect(isCodexSizeLocked(K162)).toBe(false);
    expect(isCodexSizeLocked(null)).toBe(false);
    expect(codexPanelFacts(TYPED)?.sizeClass).toBe('L');
    expect(codexPanelFacts(K162)).toBeNull();
    expect(codexPanelFacts(null)).toBeNull();

    expect(massRowDisplay(TYPED, 'stable', null, null).kind).toBe('range');
    expect(massRowDisplay(REGEN, 'stable', null, null)).toEqual({
      kind: 'regenerates',
      label: 'Regenerates — no mass interval',
    });
    expect(massRowDisplay(K162, 'stable', null, null)).toEqual({ kind: 'none' });
    expect(formatKilograms(1_500_000)).toBe('1.5M kg');

    const ceiling = lifetimeRowDisplay(CONNECTION, TYPED, 1_000);
    expect(ceiling.kind).toBe('ceiling');
    if (ceiling.kind === 'ceiling') {
      expect(ceiling.label.startsWith('≤ ')).toBe(true);
    }

    const ranged = lifetimeRowDisplay(
      withWindow(1_000 + 4 * 60 * 60 * 1000, 1_000 + 16 * 60 * 60 * 1000),
      TYPED,
      1_000,
    );
    expect(ranged.kind).toBe('range');
    if (ranged.kind === 'range') {
      expect(ranged.label).toContain('–');
      expect(ranged.title).toContain('remaining');
    }

    expect(
      lifetimeRowDisplay(withWindow(500, 900), TYPED, 1_000),
    ).toEqual({ kind: 'expired', label: 'Expired' });
    expect(formatDurationBound(90 * 60 * 1000)).toBe('1.5h');
    expect(lifetimeUpperBoundLabel(CONNECTION, TYPED, 1_000)).toBe('16h');
    expect(
      lifetimeUpperBoundLabel(
        withWindow(1_000 + 4 * 60 * 60 * 1000, 1_000 + 16 * 60 * 60 * 1000),
        TYPED,
        1_000,
      ),
    ).toBe('16h');
    expect(lifetimeUpperBoundLabel(withWindow(500, 900), TYPED, 1_000)).toBe(
      'Expired',
    );
  });
});
