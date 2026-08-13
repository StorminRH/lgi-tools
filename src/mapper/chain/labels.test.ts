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
