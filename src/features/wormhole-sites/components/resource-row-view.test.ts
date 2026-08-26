import { describe, expect, it } from 'vitest';
import type { SiteResource } from '../types';
import {
  deriveResourceRowView,
  formatM3,
  resourceValueEligible,
} from './resource-row-view';

const resource = (over: Partial<SiteResource> = {}): SiteResource => ({
  id: 1,
  orderInSite: 0,
  resourceKind: 'ore',
  resourceName: 'Arkonor',
  units: 250,
  volumeM3: 4000,
  iskPerM3: null,
  totalIsk: null,
  typeId: 22,
  liveIsk: null,
  effectiveIsk: null,
  liveEligible: true,
  ...over,
});

describe('resource row view', () => {
  it('formats volume and derives relic, ore, and gas meta', () => {
    expect(formatM3(4000)).toBe('4,000 m³');
    expect(formatM3(null)).toBe('—');

    expect(deriveResourceRowView(resource(), 'relic')).toEqual({
      colsClass: 'grid-cols-[1fr_auto]',
      meta: null,
      dotTone: 'orange',
    });
    expect(deriveResourceRowView(resource(), 'data').dotTone).toBe('blue');
    expect(deriveResourceRowView(resource({ units: 250, volumeM3: 4000 }), 'ore')).toEqual({
      colsClass: 'grid-cols-[1fr_auto_auto]',
      meta: '250 rocks · 4,000 m³',
      dotTone: null,
    });
    expect(deriveResourceRowView(resource({ units: 30, volumeM3: 600 }), 'gas').meta).toBe(
      '30 units · 600 m³',
    );
    expect(deriveResourceRowView(resource({ units: null, volumeM3: 600 }), 'gas').meta).toBe(
      '600 m³',
    );

    expect(resourceValueEligible(resource({ liveEligible: true, typeId: 22 }))).toBe(true);
    expect(resourceValueEligible(resource({ liveEligible: false, typeId: 22 }))).toBe(false);
    expect(resourceValueEligible(resource({ liveEligible: true, typeId: null }))).toBe(false);
  });
});
