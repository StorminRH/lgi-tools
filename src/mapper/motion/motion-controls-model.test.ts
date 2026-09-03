import { describe, expect, it } from 'vitest';
import { DEFAULT_MOTION_CONFIG } from './motion-contract';
import {
  COLLAPSE_WEIGHT_OPTIONS,
  EDGE_FLAVOR_OPTIONS,
  FAST_TEMPO_RANGE,
  MID_TEMPO_RANGE,
  OVERSHOOT_RANGE,
  SLOW_TEMPO_RANGE,
  commitCollapseWeight,
  commitEdgeFlavor,
  commitFastTempo,
  commitMidTempo,
  commitOvershoot,
  commitSlowTempo,
} from './motion-controls-model';

const CONFIG = DEFAULT_MOTION_CONFIG;

// ── SC-7.1 · HC-3 — every dial commit clamps to its declared range ───────────
describe('tempo tier commits', () => {
  it.each([
    ['fast', commitFastTempo, FAST_TEMPO_RANGE, (c: typeof CONFIG) => c.tempo.fast],
    ['mid', commitMidTempo, MID_TEMPO_RANGE, (c: typeof CONFIG) => c.tempo.mid],
    ['slow', commitSlowTempo, SLOW_TEMPO_RANGE, (c: typeof CONFIG) => c.tempo.slow],
  ] as const)('clamps the %s tier to its range and step', (_tier, commit, range, read) => {
    expect(read(commit(CONFIG, range.min - 999))).toBe(range.min);
    expect(read(commit(CONFIG, range.max + 999))).toBe(range.max);
    // Snaps to the step grid from the range floor.
    const offGrid = range.min + range.step + Math.floor(range.step / 3);
    expect((read(commit(CONFIG, offGrid)) - range.min) % range.step).toBe(0);
  });

  it('touches only its own tier', () => {
    const next = commitFastTempo(CONFIG, 300);

    expect(next.tempo.mid).toBe(CONFIG.tempo.mid);
    expect(next.tempo.slow).toBe(CONFIG.tempo.slow);
    expect(next.overshootPct).toBe(CONFIG.overshootPct);
  });
});

// ── SC-7.1 — integer-percent overshoot ───────────────────────────────────────
describe('overshoot commit', () => {
  it('clamps to the declared percent range', () => {
    expect(commitOvershoot(CONFIG, -5).overshootPct).toBe(OVERSHOOT_RANGE.min);
    expect(commitOvershoot(CONFIG, 400).overshootPct).toBe(OVERSHOOT_RANGE.max);
  });

  it('lands on integers for every committed value', () => {
    for (const value of [-3, 0, 7, 13.5, 39, 41]) {
      expect(Number.isInteger(commitOvershoot(CONFIG, value).overshootPct)).toBe(true);
    }
  });
});

// ── SC-7.1 · PD-3/PD-4 — the closed flavor vocabularies ──────────────────────
describe('flavor commits', () => {
  it('exposes exactly the two edge flavors and two collapse weights', () => {
    expect(EDGE_FLAVOR_OPTIONS.map((option) => option.value)).toEqual([
      'fade-with-child',
      'grow-from-parent',
    ]);
    expect(COLLAPSE_WEIGHT_OPTIONS.map((option) => option.value)).toEqual([
      'ordinary',
      'heavy',
    ]);
  });

  it('commits flavor and weight without touching the tempo', () => {
    // Commit the non-default member of each vocabulary so a no-op commit fails.
    const flavored = commitEdgeFlavor(CONFIG, 'fade-with-child');
    expect(flavored.edgeFlavor).toBe('fade-with-child');
    expect(flavored.tempo).toEqual(CONFIG.tempo);

    const weighted = commitCollapseWeight(CONFIG, 'heavy');
    expect(weighted.collapseWeight).toBe('heavy');
    expect(weighted.tempo).toEqual(CONFIG.tempo);
  });
});
