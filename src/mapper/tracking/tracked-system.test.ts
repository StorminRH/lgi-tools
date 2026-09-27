import { describe, expect, it } from 'vitest';
import {
  dockCharacterLabel,
  dockCharacters,
  resolveDockCharacter,
} from './tracked-system';

const SYSTEM = 31_000_001;
const OWNER = 'owner';

function coverage(
  entries: readonly { characterId: number; covered: boolean }[],
): ReadonlyMap<string, ReadonlyMap<number, boolean>> {
  return new Map([
    [OWNER, new Map(entries.map((entry) => [entry.characterId, entry.covered]))],
  ]);
}

function located(
  characterId: number,
  solarSystemId: number,
  transitionObservedAt: number | null,
  observedAt = 1_000,
) {
  return {
    userId: OWNER,
    characterId,
    location: { solarSystemId, transitionObservedAt, observedAt },
  };
}

describe('dockCharacters', () => {
  it('lists every own tracked character, locating only covered ones', () => {
    expect(
      dockCharacters({
        ownTrackedCharacterIds: [8, 7, 9],
        tracked: [
          located(7, SYSTEM, 500),
          located(8, SYSTEM + 1, null, 900),
          located(42, SYSTEM + 2, 2_000),
          { userId: OWNER, characterId: 9, location: null },
        ],
        coverage: coverage([
          { characterId: 7, covered: true },
          { characterId: 8, covered: false },
          { characterId: 9, covered: true },
          { characterId: 42, covered: true },
        ]),
      }),
    ).toEqual([
      { characterId: 7, systemId: SYSTEM, lastMovementAt: 500 },
      { characterId: 8, systemId: null, lastMovementAt: null },
      { characterId: 9, systemId: null, lastMovementAt: null },
    ]);
  });

  it('falls back to the last poll when a location has no jump stamp', () => {
    expect(
      dockCharacters({
        ownTrackedCharacterIds: [7],
        tracked: [located(7, SYSTEM, null, 900)],
        coverage: coverage([{ characterId: 7, covered: true }]),
      }),
    ).toEqual([{ characterId: 7, systemId: SYSTEM, lastMovementAt: 900 }]);
  });
});

describe('resolveDockCharacter', () => {
  const alpha = { characterId: 7, systemId: SYSTEM, lastMovementAt: 500 };
  const bravo = { characterId: 8, systemId: SYSTEM + 1, lastMovementAt: 900 };
  const offline = { characterId: 9, systemId: null, lastMovementAt: null };

  it('follows the character that moved most recently in Auto', () => {
    expect(resolveDockCharacter([alpha, bravo, offline], null)).toEqual({
      target: { kind: 'ready', systemId: SYSTEM + 1, characterId: 8 },
      mode: 'auto',
      pinnedCharacterId: null,
      characters: [alpha, bravo, offline],
    });
    const jumped = { ...alpha, systemId: SYSTEM + 2, lastMovementAt: 1_200 };
    expect(resolveDockCharacter([jumped, bravo], null).target).toEqual({
      kind: 'ready',
      systemId: SYSTEM + 2,
      characterId: 7,
    });
  });

  it('breaks movement ties by the lower character id', () => {
    expect(
      resolveDockCharacter([alpha, { ...bravo, lastMovementAt: 500 }], null).target,
    ).toMatchObject({ characterId: 7 });
  });

  it('holds a pinned character even when another character jumps later', () => {
    expect(resolveDockCharacter([alpha, bravo], 7)).toMatchObject({
      target: { kind: 'ready', systemId: SYSTEM, characterId: 7 },
      mode: 'pinned',
      pinnedCharacterId: 7,
    });
  });

  it('follows Auto while the pinned character is offline or not tracked on this map', () => {
    expect(resolveDockCharacter([alpha, offline], 9)).toMatchObject({
      target: { kind: 'ready', systemId: SYSTEM, characterId: 7 },
      mode: 'auto',
      pinnedCharacterId: 9,
    });
    expect(resolveDockCharacter([alpha, bravo], 1234)).toMatchObject({
      target: { kind: 'ready', characterId: 8 },
      mode: 'auto',
      pinnedCharacterId: null,
    });
  });

  it('has no target when no tracked character is online', () => {
    expect(resolveDockCharacter([offline], null).target).toEqual({ kind: 'none' });
    expect(resolveDockCharacter([], 7).target).toEqual({ kind: 'none' });
  });
});

describe('dockCharacterLabel', () => {
  const nameOf = (id: number) => (id === 7 ? 'Alpha' : 'Bravo');
  const ready = { kind: 'ready' as const, systemId: SYSTEM, characterId: 7 };

  it('names the followed character in parentheses for Auto and alone when pinned', () => {
    expect(dockCharacterLabel({ target: ready, mode: 'auto' }, nameOf)).toBe('Auto (Alpha)');
    expect(dockCharacterLabel({ target: ready, mode: 'pinned' }, nameOf)).toBe('Alpha');
    expect(dockCharacterLabel({ target: { kind: 'none' }, mode: 'auto' }, nameOf)).toBe('Auto');
  });
});
