import { describe, expect, it } from 'vitest';
import { formatStationName } from './format-station-name';

describe('formatStationName', () => {
  it('collapses the planet/moon and em-dashes the operation (the common shape)', () => {
    expect(formatStationName('Jita IV - Moon 4 - Caldari Navy Assembly Plant')).toBe(
      'Jita IV-4 — Caldari Navy Assembly Plant',
    );
    expect(formatStationName('Perimeter II - Moon 1 - Caldari Navy Assembly Plant')).toBe(
      'Perimeter II-1 — Caldari Navy Assembly Plant',
    );
  });

  it('em-dashes a planet-direct station (no moon), parenthetical included', () => {
    expect(formatStationName('Amarr VIII (Oris) - Emperor Family Academy')).toBe(
      'Amarr VIII (Oris) — Emperor Family Academy',
    );
  });

  it('leaves unusual shapes intact beyond the first separator', () => {
    // Asteroid-belt stations aren't the planet/moon shape — only the first
    // separator is promoted; the rest stays verbatim rather than being mangled.
    expect(formatStationName('Sobaseki X - Asteroid Belt 1 - Caldari Provisions Warehouse')).toBe(
      'Sobaseki X — Asteroid Belt 1 - Caldari Provisions Warehouse',
    );
  });

  it('returns a name with no separator unchanged', () => {
    expect(formatStationName('Some Station')).toBe('Some Station');
  });
});
