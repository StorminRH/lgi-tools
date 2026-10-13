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
        coverage: undefined,
      }),
    ).toEqual({ kind: 'loading' });
    expect(
      homeCurrentSystem({
        characterId: null,
        tracking: { ownTrackedCharacterIds: [], tracked: [] },
        coverage: { coverage: [] },
      }),
    ).toEqual({ kind: 'loading' });

    const empty = {
      tracking: { ownTrackedCharacterIds: [] as number[], tracked: [] },
      coverage: { coverage: [] },
    };
    expect(homeCurrentSystem({ characterId: CHAR, ...empty })).toEqual({
      kind: 'untracked',
    });

    const trackedOffline = {
      tracking: {
        ownTrackedCharacterIds: [CHAR],
        tracked: [{ characterId: CHAR, location: { solarSystemId: JITA, transitionObservedAt: null, observedAt: 0 } }],
      },
      coverage: { coverage: [{ characterId: CHAR, covered: false }] },
    };
    expect(homeCurrentSystem({ characterId: CHAR, ...trackedOffline })).toEqual({
      kind: 'offline',
    });

    const lastKnownUncovered = {
      tracking: {
        ownTrackedCharacterIds: [CHAR],
        tracked: [{ characterId: CHAR, location: { solarSystemId: JITA, transitionObservedAt: null, observedAt: 0 } }],
      },
      coverage: { coverage: [] },
    };
    expect(homeCurrentSystem({ characterId: CHAR, ...lastKnownUncovered })).toEqual({
      kind: 'offline',
    });

    const live = {
      tracking: {
        ownTrackedCharacterIds: [CHAR],
        tracked: [{ characterId: CHAR, location: { solarSystemId: JITA, transitionObservedAt: null, observedAt: 0 } }],
      },
      coverage: { coverage: [{ characterId: CHAR, covered: true }] },
    };
    expect(homeCurrentSystem({ characterId: CHAR, ...live })).toEqual({
      kind: 'ready',
      systemId: JITA,
    });
    // No active character yet: wait rather than offer the live pilot's system.
    expect(homeCurrentSystem({ characterId: null, ...live })).toEqual({
      kind: 'loading',
    });
  });

  it('uses a live tracked alt when the session character is offline or untracked', () => {
    const alt = 202;
    const altSystem = 31_001_677;
    const sessionOfflineAltLive = {
      tracking: {
        ownTrackedCharacterIds: [CHAR, alt],
        tracked: [
          { characterId: CHAR, location: { solarSystemId: JITA, transitionObservedAt: null, observedAt: 0 } },
          { characterId: alt, location: { solarSystemId: altSystem, transitionObservedAt: null, observedAt: 0 } },
        ],
      },
      coverage: {
        coverage: [
          { characterId: CHAR, covered: false },
          { characterId: alt, covered: true },
        ],
      },
    };
    expect(
      homeCurrentSystem({ characterId: CHAR, ...sessionOfflineAltLive }),
    ).toEqual({ kind: 'ready', systemId: altSystem });

    const sessionUnlocatedAltLive = {
      tracking: {
        ownTrackedCharacterIds: [CHAR, alt],
        tracked: [
          { characterId: CHAR, location: null },
          { characterId: alt, location: { solarSystemId: altSystem, transitionObservedAt: null, observedAt: 0 } },
        ],
      },
      coverage: {
        coverage: [
          { characterId: CHAR, covered: true },
          { characterId: alt, covered: true },
        ],
      },
    };
    expect(
      homeCurrentSystem({ characterId: CHAR, ...sessionUnlocatedAltLive }),
    ).toEqual({ kind: 'ready', systemId: altSystem });

    const onlyAltTracked = {
      tracking: {
        ownTrackedCharacterIds: [alt],
        tracked: [{ characterId: alt, location: { solarSystemId: altSystem, transitionObservedAt: null, observedAt: 0 } }],
      },
      coverage: { coverage: [{ characterId: alt, covered: true }] },
    };
    expect(homeCurrentSystem({ characterId: CHAR, ...onlyAltTracked })).toEqual({
      kind: 'ready',
      systemId: altSystem,
    });

    const bothLive = {
      tracking: {
        ownTrackedCharacterIds: [CHAR, alt],
        tracked: [
          { characterId: CHAR, location: { solarSystemId: JITA, transitionObservedAt: null, observedAt: 0 } },
          { characterId: alt, location: { solarSystemId: altSystem, transitionObservedAt: null, observedAt: 0 } },
        ],
      },
      coverage: {
        coverage: [
          { characterId: CHAR, covered: true },
          { characterId: alt, covered: true },
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
          { characterId: CHAR, location: { solarSystemId: JITA, transitionObservedAt: null, observedAt: 0 } },
          { characterId: alt, location: { solarSystemId: altSystem, transitionObservedAt: null, observedAt: 0 } },
          { characterId: 303, location: { solarSystemId: JITA, transitionObservedAt: null, observedAt: 0 } },
        ],
      },
      coverage: {
        coverage: [
          { characterId: CHAR, covered: false },
          { characterId: alt, covered: true },
          { characterId: 303, covered: true },
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
          { characterId: alt, location: { solarSystemId: altSystem, transitionObservedAt: null, observedAt: 0 } },
          { characterId: 303, location: { solarSystemId: altSystem, transitionObservedAt: null, observedAt: 0 } },
        ],
      },
      coverage: {
        coverage: [
          { characterId: alt, covered: true },
          { characterId: 303, covered: true },
        ],
      },
    };
    expect(homeCurrentSystem({ characterId: CHAR, ...twoAltsSameSystem })).toEqual({
      kind: 'ready',
      systemId: altSystem,
    });
  });
});
