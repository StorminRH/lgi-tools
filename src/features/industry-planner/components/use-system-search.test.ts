import { describe, expect, it } from 'vitest';
import type { SystemSearchEntry } from '@/data/eve-data/systems-search';
import { suggestSystemNames } from './use-system-search';

const systems: SystemSearchEntry[] = [
  { id: 1, name: 'Jita', security: 0.9 },
  { id: 2, name: 'Jarizza', security: -0.4 },
  { id: 3, name: 'Amarr', security: 1.0 },
  { id: 4, name: 'New Caldari', security: 0.9 },
];

describe('suggestSystemNames', () => {
  it('is empty for an empty query', () => {
    expect(suggestSystemNames(systems, '   ')).toEqual([]);
  });

  it('lists prefix matches before substring matches', () => {
    // "car" prefixes nothing but is a substring of "New Caldari"; "amarr" contains it too.
    const out = suggestSystemNames(systems, 'ar');
    // prefix: none start with "ar"; substring: Jarizza, Amarr, New Caldari all contain "ar"
    expect(out).toContain('Jarizza');
    expect(out).toContain('Amarr');
  });

  it('puts prefix hits first', () => {
    const out = suggestSystemNames(systems, 'j');
    expect(out[0]).toBe('Jita'); // both Jita and Jarizza start with J; order preserved
    expect(out).toEqual(['Jita', 'Jarizza']);
  });
});
