import { describe, expect, it } from 'vitest';
import { formatClassRange, siteClassRange, wormholeClassRank } from './site-class';
import { WORMHOLE_CLASSES } from './site-taxonomy';

const gas = (name: string) => ({ wormholeClass: null, siteType: 'gas', name }) as const;

describe('siteClassRange', () => {
  it('gives a classed site its own class as both ends of the range', () => {
    expect(siteClassRange({ wormholeClass: 'C4', siteType: 'combat', name: 'Anything' })).toEqual({
      min: 'C4',
      max: 'C4',
    });
  });

  it.each([
    ['Barren Perimeter Reservoir', 'C1', 'C6'],
    ['Minor Perimeter Reservoir', 'C1', 'C6'],
    ['Bountiful Frontier Reservoir', 'C3', 'C6'],
    ['Instrumental Core Reservoir', 'C5', 'C6'],
    ['Vital Core Reservoir', 'C5', 'C6'],
  ])('reads a class-less gas site %s as %s to %s', (name, min, max) => {
    expect(siteClassRange(gas(name))).toEqual({ min, max });
  });

  it('lets a gas site’s own class win over its name', () => {
    expect(
      siteClassRange({ wormholeClass: 'C2', siteType: 'gas', name: 'Barren Perimeter Reservoir' }),
    ).toEqual({ min: 'C2', max: 'C2' });
  });

  it('has no range for an unrecognized gas name or a class-less non-gas site', () => {
    expect(siteClassRange(gas('Some Other Site'))).toBeNull();
    expect(
      siteClassRange({ wormholeClass: null, siteType: 'combat', name: 'Perimeter Ambush Point' }),
    ).toBeNull();
  });
});

describe('wormholeClassRank', () => {
  it('ranks C1 to C6 from 0 in order', () => {
    expect(WORMHOLE_CLASSES.map(wormholeClassRank)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('formatClassRange', () => {
  it('prints a span with an en dash and a single class bare', () => {
    expect(formatClassRange({ min: 'C3', max: 'C6' })).toBe('C3–C6');
    expect(formatClassRange({ min: 'C4', max: 'C4' })).toBe('C4');
  });
});
