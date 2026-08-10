import { describe, expect, it } from 'vitest';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';
import { resolveSystemLabel } from './labels';

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

// The class-id → text ladder itself is owned and tested by
// `src/data/eve-data/system-identity.test.ts`; this file covers only the
// directory-entry resolution and its silent fallbacks.
describe('node label resolution', () => {
  it('renders a known system’s directory name and class', () => {
    const label = resolveSystemLabel(
      HOLE,
      directory([entry(HOLE, 'J123456', 5)]),
    );

    expect(label).toEqual({
      name: 'J123456',
      className: 'C5',
      security: null,
      whClassId: 5,
    });
  });

  it('renders a known k-space system with no class chip', () => {
    const label = resolveSystemLabel(JITA, directory([entry(JITA, 'Jita', null)]));

    expect(label).toEqual({
      name: 'Jita',
      className: null,
      security: null,
      whClassId: null,
    });
  });

  it('falls back to the bare id for an unknown system, with no class chip', () => {
    const label = resolveSystemLabel(JITA, directory([]));

    expect(label).toEqual({
      name: String(JITA),
      className: null,
      security: null,
      whClassId: null,
    });
  });

  // HC-5: an unloaded directory is not a loading state, just a plainer label.
  it('falls back silently when the directory has not loaded', () => {
    const label = resolveSystemLabel(JITA, null);

    expect(label).toEqual({
      name: String(JITA),
      className: null,
      security: null,
      whClassId: null,
    });
  });
});
