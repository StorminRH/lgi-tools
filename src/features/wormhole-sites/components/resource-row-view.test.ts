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

describe('formatM3', () => {
  it('renders a volume or an em dash for null', () => {
    expect(formatM3(4000)).toBe('4,000 m³');
    expect(formatM3(null)).toBe('—');
  });
});

describe('deriveResourceRowView', () => {
  it('gives hackable containers a two-column row with a coloured dot', () => {
    expect(deriveResourceRowView(resource(), 'relic')).toEqual({
      colsClass: 'grid-cols-[1fr_auto]',
      meta: null,
      dotTone: 'orange',
    });
    expect(deriveResourceRowView(resource(), 'data').dotTone).toBe('blue');
  });

  it('gives ore a rocks·volume meta line', () => {
    expect(deriveResourceRowView(resource({ units: 250, volumeM3: 4000 }), 'ore')).toEqual({
      colsClass: 'grid-cols-[1fr_auto_auto]',
      meta: '250 rocks · 4,000 m³',
      dotTone: null,
    });
  });

  it('gives gas a units·volume meta, or volume alone when unit count is absent', () => {
    expect(deriveResourceRowView(resource({ units: 30, volumeM3: 600 }), 'gas').meta).toBe(
      '30 units · 600 m³',
    );
    expect(deriveResourceRowView(resource({ units: null, volumeM3: 600 }), 'gas').meta).toBe(
      '600 m³',
    );
  });
});

describe('resourceValueEligible', () => {
  it('is true only for a live-eligible resource carrying a type id', () => {
    expect(resourceValueEligible(resource({ liveEligible: true, typeId: 22 }))).toBe(true);
    expect(resourceValueEligible(resource({ liveEligible: false, typeId: 22 }))).toBe(false);
    expect(resourceValueEligible(resource({ liveEligible: true, typeId: null }))).toBe(false);
  });
});
