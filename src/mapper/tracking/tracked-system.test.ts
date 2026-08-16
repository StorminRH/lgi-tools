import { describe, expect, it } from 'vitest';
import { trackedSystemTarget } from './tracked-system';

const SYSTEM = 31_000_001;

describe('trackedSystemTarget', () => {
  it('targets any tracked last-known system and refuses empty or multi-system state', () => {
    const tracked = [
      {
        characterId: 7,
        location: { solarSystemId: SYSTEM },
      },
      {
        characterId: 8,
        location: { solarSystemId: SYSTEM + 1 },
      },
    ];
    expect(
      trackedSystemTarget({
        ownTrackedCharacterIds: [7],
        tracked,
      }),
    ).toEqual({ kind: 'ready', systemId: SYSTEM });
    expect(
      trackedSystemTarget({
        ownTrackedCharacterIds: [7, 8],
        tracked,
      }),
    ).toEqual({ kind: 'ambiguous' });
    expect(
      trackedSystemTarget({
        ownTrackedCharacterIds: [7, 8],
        tracked: [
          {
            characterId: 7,
            location: { solarSystemId: SYSTEM },
          },
          {
            characterId: 8,
            location: { solarSystemId: SYSTEM },
          },
        ],
      }),
    ).toEqual({ kind: 'ready', systemId: SYSTEM });
    expect(
      trackedSystemTarget({
        ownTrackedCharacterIds: [7],
        tracked: [{ characterId: 7, location: null }],
      }),
    ).toEqual({ kind: 'none' });
  });
});
