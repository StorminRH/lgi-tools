import { describe, expect, it } from 'vitest';
import { homeCurrentSystem } from './home-prompt-model';

const JITA = 30_000_142;
const CHAR = 101;

describe('homeCurrentSystem', () => {
  it('walks loading, untracked, offline, and last-known location', () => {
    expect(
      homeCurrentSystem({
        characterId: CHAR,
        tracking: undefined,
      }),
    ).toEqual({ kind: 'loading' });
    expect(
      homeCurrentSystem({
        characterId: null,
        tracking: { ownTrackedCharacterIds: [], tracked: [] },
      }),
    ).toEqual({ kind: 'loading' });

    expect(
      homeCurrentSystem({
        characterId: CHAR,
        tracking: { ownTrackedCharacterIds: [], tracked: [] },
      }),
    ).toEqual({ kind: 'untracked' });

    expect(
      homeCurrentSystem({
        characterId: CHAR,
        tracking: {
          ownTrackedCharacterIds: [CHAR],
          tracked: [{ characterId: CHAR, location: null }],
        },
      }),
    ).toEqual({ kind: 'offline' });

    expect(
      homeCurrentSystem({
        characterId: CHAR,
        tracking: {
          ownTrackedCharacterIds: [CHAR],
          tracked: [{ characterId: CHAR, location: { solarSystemId: JITA } }],
        },
      }),
    ).toEqual({
      kind: 'ready',
      systemId: JITA,
    });
  });

  it('uses a tracked alt when the session character has no last-known system', () => {
    const alt = 202;
    const altSystem = 31_001_677;

    expect(
      homeCurrentSystem({
        characterId: CHAR,
        tracking: {
          ownTrackedCharacterIds: [CHAR, alt],
          tracked: [
            { characterId: CHAR, location: null },
            { characterId: alt, location: { solarSystemId: altSystem } },
          ],
        },
      }),
    ).toEqual({ kind: 'ready', systemId: altSystem });

    expect(
      homeCurrentSystem({
        characterId: CHAR,
        tracking: {
          ownTrackedCharacterIds: [alt],
          tracked: [{ characterId: alt, location: { solarSystemId: altSystem } }],
        },
      }),
    ).toEqual({
      kind: 'ready',
      systemId: altSystem,
    });

    expect(
      homeCurrentSystem({
        characterId: CHAR,
        tracking: {
          ownTrackedCharacterIds: [CHAR, alt],
          tracked: [
            { characterId: CHAR, location: { solarSystemId: JITA } },
            { characterId: alt, location: { solarSystemId: altSystem } },
          ],
        },
      }),
    ).toEqual({
      kind: 'ready',
      systemId: JITA,
    });

    expect(
      homeCurrentSystem({
        characterId: CHAR,
        tracking: {
          ownTrackedCharacterIds: [CHAR, alt, 303],
          tracked: [
            { characterId: CHAR, location: null },
            { characterId: alt, location: { solarSystemId: altSystem } },
            { characterId: 303, location: { solarSystemId: JITA } },
          ],
        },
      }),
    ).toEqual({ kind: 'offline' });

    expect(
      homeCurrentSystem({
        characterId: CHAR,
        tracking: {
          ownTrackedCharacterIds: [CHAR, alt, 303],
          tracked: [
            { characterId: alt, location: { solarSystemId: altSystem } },
            { characterId: 303, location: { solarSystemId: altSystem } },
          ],
        },
      }),
    ).toEqual({
      kind: 'ready',
      systemId: altSystem,
    });
  });
});
