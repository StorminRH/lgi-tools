import { describe, expect, it } from 'vitest';
import {
  CONNECTION_MASS_STATES,
  WORMHOLE_LIFE_STAGES,
  WORMHOLE_SIZE_CLASSES,
} from './wormhole-contract';

describe('wormhole-contract vocabularies', () => {
  it('owns the observed mass and Reliable Lifetime buckets', () => {
    expect(CONNECTION_MASS_STATES).toEqual(['stable', 'reduced', 'critical']);
    expect(WORMHOLE_LIFE_STAGES).toEqual([
      'under_1_day',
      'under_4_hours',
      'under_1_hour',
      'expired',
    ]);
    expect(WORMHOLE_SIZE_CLASSES).toEqual(['S', 'M', 'L', 'XL']);
  });
});
