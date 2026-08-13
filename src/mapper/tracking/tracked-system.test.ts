import { describe, expect, it } from 'vitest';
import { trackedSystemTarget } from './tracked-system';

const SYSTEM = 31_000_001;
const OWNER = 'owner';

function freshness(
  entries: readonly { characterId: number; feedFreshAt: number | null }[],
): ReadonlyMap<string, ReadonlyMap<number, number | null>> {
  return new Map([
    [OWNER, new Map(entries.map((entry) => [entry.characterId, entry.feedFreshAt]))],
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
        freshness: freshness([
          { characterId: 7, feedFreshAt: 1 },
          { characterId: 8, feedFreshAt: null },
        ]),
      }),
    ).toEqual({ kind: 'ready', systemId: SYSTEM });
    expect(
      trackedSystemTarget({
        ownTrackedCharacterIds: [7, 8],
        tracked,
        freshness: freshness([
          { characterId: 7, feedFreshAt: 1 },
          { characterId: 8, feedFreshAt: 1 },
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
        freshness: freshness([
          { characterId: 7, feedFreshAt: 1 },
          { characterId: 8, feedFreshAt: 1 },
        ]),
      }),
    ).toEqual({ kind: 'ready', systemId: SYSTEM });
    expect(
      trackedSystemTarget({
        ownTrackedCharacterIds: [7],
        tracked: [{ userId: OWNER, characterId: 7, location: null }],
        freshness: freshness([{ characterId: 7, feedFreshAt: 1 }]),
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
        freshness: freshness([{ characterId: 7, feedFreshAt: null }]),
      }),
    ).toEqual({ kind: 'none' });
  });
});
