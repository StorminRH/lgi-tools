import { describe, expect, it } from 'vitest';
import { DEFAULT_FOG_CONFIG } from '../fog/fog-model';
import { HALO_PINNED_LIMITS } from '../halo/halo-model';
import { DEFAULT_LAYOUT_CONFIG, DIRECTION_PRESETS } from '../layout/layout-contract';
import {
  commitDirectionPreset,
  commitFogOpacityPct,
  commitFogRevealRadius,
  commitFogStrokeRadius,
  commitFogTier,
  commitHaloDrawnRings,
  commitHaloFoggedRings,
  commitHaloPerExitCap,
  commitHaloTotalCap,
  commitMinSeparation,
  commitRingSpacing,
  commitSiblingSpread,
  commitWedgePolicy,
  directionPresetOf,
} from './map-controls-model';

describe('map controls model', () => {
  it('holds ring spacing ≥ separation when ring spacing shrinks', () => {
    const next = commitRingSpacing(
      { ...DEFAULT_LAYOUT_CONFIG, ringSpacing: 240, minSeparation: 200 },
      160,
    );
    expect(next.ringSpacing).toBe(160);
    expect(next.minSeparation).toBe(160);
    expect(next.ringSpacing).toBeGreaterThanOrEqual(next.minSeparation);
  });

  it('holds ring spacing ≥ separation when separation grows', () => {
    const next = commitMinSeparation(
      { ...DEFAULT_LAYOUT_CONFIG, ringSpacing: 200, minSeparation: 140 },
      220,
    );
    expect(next.minSeparation).toBe(220);
    expect(next.ringSpacing).toBe(220);
    expect(next.ringSpacing).toBeGreaterThanOrEqual(next.minSeparation);
  });

  it('maps sibling fan and posture to config exactly', () => {
    expect(commitSiblingSpread(DEFAULT_LAYOUT_CONFIG, 5).siblingSpread).toBe(5);
    expect(commitWedgePolicy(DEFAULT_LAYOUT_CONFIG, 'proportional').wedgePolicy).toBe(
      'proportional',
    );
  });

  it('resolves direction presets to DIRECTION_PRESETS constants', () => {
    for (const id of Object.keys(DIRECTION_PRESETS) as (keyof typeof DIRECTION_PRESETS)[]) {
      const next = commitDirectionPreset(DEFAULT_LAYOUT_CONFIG, id);
      expect(next.directionSequence).toBe(DIRECTION_PRESETS[id]);
      expect(directionPresetOf(next)).toBe(id);
    }
  });

  // ── OW4 — G-1 halo/fog tuning dials clamp to their ranges ──────────────────
  it('clamps halo dial commits into range', () => {
    expect(commitHaloDrawnRings(HALO_PINNED_LIMITS, 9).drawnRings).toBe(4);
    expect(commitHaloDrawnRings(HALO_PINNED_LIMITS, -1).drawnRings).toBe(0);
    expect(commitHaloFoggedRings(HALO_PINNED_LIMITS, 7).foggedRings).toBe(2);
    expect(commitHaloPerExitCap(HALO_PINNED_LIMITS, 5).maxSystemsPerExit).toBe(10);
    expect(commitHaloPerExitCap(HALO_PINNED_LIMITS, 999).maxSystemsPerExit).toBe(120);
    expect(commitHaloTotalCap(HALO_PINNED_LIMITS, 1000).maxSystemsTotal).toBe(300);
    // Untouched fields survive a commit unchanged.
    expect(commitHaloDrawnRings(HALO_PINNED_LIMITS, 3)).toMatchObject({
      foggedRings: HALO_PINNED_LIMITS.foggedRings,
      maxSystemsPerExit: HALO_PINNED_LIMITS.maxSystemsPerExit,
      maxSystemsTotal: HALO_PINNED_LIMITS.maxSystemsTotal,
    });
  });

  it('clamps fog dial commits, storing density as a fraction', () => {
    expect(commitFogRevealRadius(DEFAULT_FOG_CONFIG, 5000).revealRadius).toBe(320);
    expect(commitFogStrokeRadius(DEFAULT_FOG_CONFIG, 0).strokeRadius).toBe(20);
    expect(commitFogOpacityPct(DEFAULT_FOG_CONFIG, 85).opacity).toBe(0.85);
    expect(commitFogOpacityPct(DEFAULT_FOG_CONFIG, 500).opacity).toBe(1);
    expect(commitFogTier(DEFAULT_FOG_CONFIG, 'static').tier).toBe('static');
  });
});
