import { describe, expect, it } from 'vitest';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';
import { resolveSystemLabel, systemClassLabel } from './labels';

const JITA = 30_000_142;
const HOLE = 31_000_001;

function directory(
  entries: readonly SystemDirectoryEntry[],
): (id: number) => SystemDirectoryEntry | null {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return (id) => byId.get(id) ?? null;
}

function entry(
  id: number,
  name: string,
  whClassId: number | null,
): SystemDirectoryEntry {
  return { id, name, whClassId, security: null };
}

describe('system class labels', () => {
  it.each([
    [1, 'C1'],
    [2, 'C2'],
    [3, 'C3'],
    [4, 'C4'],
    [5, 'C5'],
    [6, 'C6'],
    [7, 'HS'],
    [8, 'LS'],
    [9, 'NS'],
    [12, 'Thera'],
    [13, 'C13'],
    [14, 'Drifter'],
    [15, 'Drifter'],
    [16, 'Drifter'],
    [17, 'Drifter'],
    [18, 'Drifter'],
    [25, 'Pochven'],
  ])('labels class id %i as %s', (classId, label) => {
    expect(systemClassLabel(classId)).toBe(label);
  });

  it('has no chip for k-space null or an unassigned SDE id', () => {
    expect(systemClassLabel(null)).toBeNull();
    // 99 is synthetic — no real system carries it. The set assertion above is what guards real ids.
    expect(systemClassLabel(99)).toBeNull();
  });
});

describe('node label resolution', () => {
  it('resolves directory names with class/security fields and bare-id fallbacks', () => {
    expect(
      resolveSystemLabel(HOLE, directory([entry(HOLE, 'J123456', 5)])),
    ).toEqual({
      name: 'J123456',
      className: 'C5',
      security: null,
      whClassId: 5,
    });

    expect(
      resolveSystemLabel(JITA, directory([entry(JITA, 'Jita', null)])),
    ).toEqual({
      name: 'Jita',
      className: null,
      security: null,
      whClassId: null,
    });

    // Unknown system and an unloaded directory both fall back to the bare id
    // with no class chip — HC-5: unloaded is not a loading state.
    const bare = {
      name: String(JITA),
      className: null,
      security: null,
      whClassId: null,
    };
    expect(resolveSystemLabel(JITA, directory([]))).toEqual(bare);
    expect(resolveSystemLabel(JITA, null)).toEqual(bare);
  });
});
