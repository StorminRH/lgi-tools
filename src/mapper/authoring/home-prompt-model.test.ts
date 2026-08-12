import { describe, expect, it } from 'vitest';
import { homeCurrentSystem } from './home-prompt-model';

const JITA = 30_000_142;
const CHAR = 101;

describe('homeCurrentSystem', () => {
  it('walks loading, untracked, offline, and live coverage', () => {
    expect(
      homeCurrentSystem({
        characterId: CHAR,
        tracking: undefined,
        freshness: undefined,
      }),
    ).toEqual({ kind: 'loading' });
    expect(
      homeCurrentSystem({
        characterId: null,
        tracking: { ownTrackedCharacterIds: [], tracked: [] },
        freshness: { fresh: [] },
      }),
    ).toEqual({ kind: 'loading' });

    const empty = {
      tracking: { ownTrackedCharacterIds: [] as number[], tracked: [] },
      freshness: { fresh: [] },
    };
    expect(homeCurrentSystem({ characterId: CHAR, ...empty })).toEqual({
      kind: 'untracked',
    });

    const trackedOffline = {
      tracking: {
        ownTrackedCharacterIds: [CHAR],
        tracked: [{ characterId: CHAR, location: { solarSystemId: JITA } }],
      },
      freshness: { fresh: [{ characterId: CHAR, feedFreshAt: null }] },
    };
    expect(homeCurrentSystem({ characterId: CHAR, ...trackedOffline })).toEqual({
      kind: 'offline',
    });

    const lastKnownUncovered = {
      tracking: {
        ownTrackedCharacterIds: [CHAR],
        tracked: [{ characterId: CHAR, location: { solarSystemId: JITA } }],
      },
      freshness: { fresh: [] },
    };
    expect(homeCurrentSystem({ characterId: CHAR, ...lastKnownUncovered })).toEqual({
      kind: 'offline',
    });

    const live = {
      tracking: {
        ownTrackedCharacterIds: [CHAR],
        tracked: [{ characterId: CHAR, location: { solarSystemId: JITA } }],
      },
      freshness: { fresh: [{ characterId: CHAR, feedFreshAt: 1_700_000_000_000 }] },
    };
    expect(homeCurrentSystem({ characterId: CHAR, ...live })).toEqual({
      kind: 'ready',
      systemId: JITA,
    });
  });
});
