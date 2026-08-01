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

  // Every id the SDE actually assigns must produce a chip. Asserting this as a set is what makes an
  // omission fail here rather than silently rendering a real wormhole system with no class.
  it('covers the whole authoritative class ladder', () => {
    const declared = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 25];

    const unlabelled = declared.filter((id) => systemClassLabel(id) === null);

    expect(unlabelled).toEqual([]);
  });

  it('has no chip for a k-space system', () => {
    expect(systemClassLabel(null)).toBeNull();
  });

  it('has no chip for an id the SDE does not assign', () => {
    // 99 is synthetic — no real system carries it. The set assertion above is what guards real ids.
    expect(systemClassLabel(99)).toBeNull();
  });
});

describe('node label resolution', () => {
  it('renders a known system’s directory name and class', () => {
    const label = resolveSystemLabel(
      HOLE,
      directory([entry(HOLE, 'J123456', 5)]),
    );

    expect(label).toEqual({ name: 'J123456', className: 'C5' });
  });

  it('renders a known k-space system with no class chip', () => {
    const label = resolveSystemLabel(JITA, directory([entry(JITA, 'Jita', null)]));

    expect(label).toEqual({ name: 'Jita', className: null });
  });

  it('falls back to the bare id for an unknown system, with no class chip', () => {
    const label = resolveSystemLabel(JITA, directory([]));

    expect(label).toEqual({ name: String(JITA), className: null });
  });

  // HC-5: an unloaded directory is not a loading state, just a plainer label.
  it('falls back silently when the directory has not loaded', () => {
    const label = resolveSystemLabel(JITA, null);

    expect(label).toEqual({ name: String(JITA), className: null });
  });
});
