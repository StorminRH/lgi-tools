import { describe, expect, it } from 'vitest';
import { siteResource } from '../__tests__/site-fixtures';
import {
  deriveResourceRowView,
  formatM3,
  resourceValueEligible,
} from './resource-row-view';

describe('resource row view', () => {
  it('formats volume and derives relic, ore, and gas meta', () => {
    expect(formatM3(4000)).toBe('4,000 m³');
    expect(formatM3(null)).toBe('—');

    expect(deriveResourceRowView(siteResource(), 'relic')).toEqual({
      colsClass: 'grid-cols-[1fr_auto]',
      meta: null,
      dotTone: 'orange',
    });
    expect(deriveResourceRowView(siteResource(), 'data').dotTone).toBe('blue');
    expect(deriveResourceRowView(siteResource({ units: 250, volumeM3: 4000 }), 'ore')).toEqual({
      colsClass: 'grid-cols-[1fr_auto_auto]',
      meta: '250 rocks · 4,000 m³',
      dotTone: null,
    });
    expect(deriveResourceRowView(siteResource({ units: 30, volumeM3: 600 }), 'gas').meta).toBe(
      '30 units · 600 m³',
    );
    expect(deriveResourceRowView(siteResource({ units: null, volumeM3: 600 }), 'gas').meta).toBe(
      '600 m³',
    );

    expect(resourceValueEligible(siteResource({ liveEligible: true, typeId: 22 }))).toBe(true);
    expect(resourceValueEligible(siteResource({ liveEligible: false, typeId: 22 }))).toBe(false);
    expect(resourceValueEligible(siteResource({ liveEligible: true, typeId: null }))).toBe(false);
  });
});
