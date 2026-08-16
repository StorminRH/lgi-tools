import { describe, expect, it } from 'vitest';
import { trackedSystemTarget } from './tracked-system';

const SYSTEM = 31_000_001;
const OWNER = 'owner';

function coverage(
  entries: readonly { characterId: number; covered: boolean }[],
): ReadonlyMap<string, ReadonlyMap<number, boolean>> {
  return new Map([
    [OWNER, new Map(entries.map((entry) => [entry.characterId, entry.covered]))],
  ]);
}

describe('trackedSystemTarget', () => {
  it('targets any online tracked pilot and refuses offline, empty, or multi-system state', () => {
    const tracked = [
      {
        userId: OWNER,
        characterId: 7,
        location: { solarSystemId: SYSTEM },
      },
      {
        userId: OWNER,
        characterId: 8,
        location: { solarSystemId: SYSTEM + 1 },
      },
    ];
    expect(
      trackedSystemTarget({
        ownTrackedCharacterIds: [7, 8],
        tracked,
        coverage: coverage([
          { characterId: 7, covered: true },
          { characterId: 8, covered: false },
        ]),
      }),
    ).toEqual({ kind: 'ready', systemId: SYSTEM });
    expect(
      trackedSystemTarget({
        ownTrackedCharacterIds: [7, 8],
        tracked,
        coverage: coverage([
          { characterId: 7, covered: true },
          { characterId: 8, covered: true },
        ]),
      }),
    ).toEqual({ kind: 'ambiguous' });
    expect(
      trackedSystemTarget({
        ownTrackedCharacterIds: [7, 8],
        tracked: [
          {
            userId: OWNER,
            characterId: 7,
            location: { solarSystemId: SYSTEM },
          },
          {
            userId: OWNER,
            characterId: 8,
            location: { solarSystemId: SYSTEM },
          },
        ],
        coverage: coverage([
          { characterId: 7, covered: true },
          { characterId: 8, covered: true },
        ]),
      }),
    ).toEqual({ kind: 'ready', systemId: SYSTEM });
    expect(
      trackedSystemTarget({
        ownTrackedCharacterIds: [7],
        tracked: [{ userId: OWNER, characterId: 7, location: null }],
        coverage: coverage([{ characterId: 7, covered: true }]),
      }),
    ).toEqual({ kind: 'none' });
    expect(
      trackedSystemTarget({
        ownTrackedCharacterIds: [7],
        tracked: [
          {
            userId: OWNER,
            characterId: 7,
            location: { solarSystemId: SYSTEM },
          },
        ],
        coverage: coverage([{ characterId: 7, covered: false }]),
      }),
    ).toEqual({ kind: 'none' });
  });
});
