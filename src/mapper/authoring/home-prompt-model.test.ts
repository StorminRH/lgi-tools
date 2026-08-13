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

  it('uses a live tracked alt when the session character is offline or untracked', () => {
    const alt = 202;
    const altSystem = 31_001_677;
    const sessionOfflineAltLive = {
      tracking: {
        ownTrackedCharacterIds: [CHAR, alt],
        tracked: [
          { characterId: CHAR, location: { solarSystemId: JITA } },
          { characterId: alt, location: { solarSystemId: altSystem } },
        ],
      },
      freshness: {
        fresh: [
          { characterId: CHAR, feedFreshAt: null },
          { characterId: alt, feedFreshAt: 1_700_000_000_000 },
        ],
      },
    };
    expect(
      homeCurrentSystem({ characterId: CHAR, ...sessionOfflineAltLive }),
    ).toEqual({ kind: 'ready', systemId: altSystem });

    const onlyAltTracked = {
      tracking: {
        ownTrackedCharacterIds: [alt],
        tracked: [{ characterId: alt, location: { solarSystemId: altSystem } }],
      },
      freshness: { fresh: [{ characterId: alt, feedFreshAt: 1_700_000_000_000 }] },
    };
    expect(homeCurrentSystem({ characterId: CHAR, ...onlyAltTracked })).toEqual({
      kind: 'ready',
      systemId: altSystem,
    });

    const bothLive = {
      tracking: {
        ownTrackedCharacterIds: [CHAR, alt],
        tracked: [
          { characterId: CHAR, location: { solarSystemId: JITA } },
          { characterId: alt, location: { solarSystemId: altSystem } },
        ],
      },
      freshness: {
        fresh: [
          { characterId: CHAR, feedFreshAt: 1_700_000_000_000 },
          { characterId: alt, feedFreshAt: 1_700_000_000_000 },
        ],
      },
    };
    expect(homeCurrentSystem({ characterId: CHAR, ...bothLive })).toEqual({
      kind: 'ready',
      systemId: JITA,
    });

    const twoAltsDifferentSystems = {
      tracking: {
        ownTrackedCharacterIds: [CHAR, alt, 303],
        tracked: [
          { characterId: CHAR, location: { solarSystemId: JITA } },
          { characterId: alt, location: { solarSystemId: altSystem } },
          { characterId: 303, location: { solarSystemId: JITA } },
        ],
      },
      freshness: {
        fresh: [
          { characterId: CHAR, feedFreshAt: null },
          { characterId: alt, feedFreshAt: 1_700_000_000_000 },
          { characterId: 303, feedFreshAt: 1_700_000_000_000 },
        ],
      },
    };
    expect(
      homeCurrentSystem({ characterId: CHAR, ...twoAltsDifferentSystems }),
    ).toEqual({ kind: 'offline' });

    const twoAltsSameSystem = {
      tracking: {
        ownTrackedCharacterIds: [CHAR, alt, 303],
        tracked: [
          { characterId: alt, location: { solarSystemId: altSystem } },
          { characterId: 303, location: { solarSystemId: altSystem } },
        ],
      },
      freshness: {
        fresh: [
          { characterId: alt, feedFreshAt: 1_700_000_000_000 },
          { characterId: 303, feedFreshAt: 1_700_000_000_000 },
        ],
      },
    };
    expect(homeCurrentSystem({ characterId: CHAR, ...twoAltsSameSystem })).toEqual({
      kind: 'ready',
      systemId: altSystem,
    });
  });
});
