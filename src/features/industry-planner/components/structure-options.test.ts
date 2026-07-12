import { describe, expect, it } from 'vitest';
import type { AvailableStructure } from '../types';
import { structureOptionGroups } from './structure-options';

// Only id/source/name are read; the rest of AvailableStructure is fixture noise.
function structure(id: string, source: 'corp' | 'custom', name: string): AvailableStructure {
  return { id, source, name } as unknown as AvailableStructure;
}

describe('structureOptionGroups', () => {
  it('splits corp and custom into labelled groups with encoded values', () => {
    const groups = structureOptionGroups([
      structure('1', 'corp', 'Sotiyo'),
      structure('2', 'custom', 'Raitaru'),
    ]);
    expect(groups.map((g) => g.group)).toEqual(['Corp structures', 'Custom structures']);
    expect(groups[0]?.options).toEqual([{ value: 'structure:1', label: 'Sotiyo' }]);
    expect(groups[1]?.options).toEqual([{ value: 'structure:2', label: 'Raitaru' }]);
  });

  it('omits a segment with no structures', () => {
    const groups = structureOptionGroups([structure('2', 'custom', 'Raitaru')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.group).toBe('Custom structures');
  });

  it('returns nothing when there are no structures', () => {
    expect(structureOptionGroups([])).toEqual([]);
  });
});
