import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT_CONFIG, DIRECTION_PRESETS } from '../layout/layout-contract';
import {
  commitDirectionPreset,
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
});
