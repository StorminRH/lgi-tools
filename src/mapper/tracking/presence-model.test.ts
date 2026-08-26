import { expect, test } from 'vitest';
import {
  coverageIndex,
  coverageQueryArgs,
  derivePresence,
  derivePresenceFromPayload,
  friendlyRows,
  presenceStatusWord,
  type TrackedPresenceRow,
} from './presence-model';

const NOW = 1_700_000_000_000;
const JITA = 30_000_142;
const AMARR = 30_002_187;
const OWNER = 'owner';

function row(overrides: {
  userId?: string;
  characterId: number;
  solarSystemId?: number;
  stationId?: number | null;
  structureId?: number | null;
  shipTypeId?: number | null;
  transitionObservedAt?: number | null;
  observedAt?: number;
  location?: null;
}): TrackedPresenceRow {
  if (overrides.location === null) {
    return {
      userId: overrides.userId ?? OWNER,
      characterId: overrides.characterId,
      location: null,
    };
  }
  return {
    userId: overrides.userId ?? OWNER,
    characterId: overrides.characterId,
    location: {
      solarSystemId: overrides.solarSystemId ?? JITA,
      stationId: overrides.stationId ?? null,
      structureId: overrides.structureId ?? null,
      shipTypeId: overrides.shipTypeId ?? 670,
      transitionObservedAt: overrides.transitionObservedAt ?? NOW - 60_000,
      observedAt: overrides.observedAt ?? NOW - 60_000,
    },
  };
}

function derive(
  tracked: TrackedPresenceRow[],
  options?: { coverage?: ReadonlyMap<number, boolean> },
) {
  return derivePresence({
    tracked,
    coverage: new Map([
      [
        OWNER,
        options?.coverage
          ?? new Map(tracked.map((entry) => [entry.characterId, true])),
      ],
    ]),
  });
}

test('presence honesty: covered shows, uncovered hides last-known', () => {
  const stationary = derive([
    row({
      characterId: 1,
      transitionObservedAt: NOW - 86_400_000,
      observedAt: NOW - 86_400_000,
    }),
  ]).get(JITA)?.pilots[0];
  expect(stationary?.lastMovementAt).toBe(NOW - 86_400_000);
  expect(stationary && presenceStatusWord(stationary)).toBe('In space');

  expect(
    derive([row({ characterId: 1 })], { coverage: new Map([[1, false]]) }).size,
  ).toBe(0);
  expect(
    derive([row({ characterId: 1 })], { coverage: new Map() }).size,
  ).toBe(0);
  expect(derive([row({ characterId: 1, location: null })]).size).toBe(0);
});

test('presence honesty: docking is location, not a third presence state', () => {
  const station = derive([row({ characterId: 1, stationId: 60_003_760 })]).get(JITA)?.pilots[0];
  const structure = derive([row({ characterId: 1, structureId: 1_035_466_617_946 })]).get(JITA)
    ?.pilots[0];
  expect(station?.docked).toBe(true);
  expect(structure?.docked).toBe(true);
  expect(station && presenceStatusWord(station)).toBe('Docked');
});

test('presence shape groups, dedupes, isolates owners, and labels friendlies', () => {
  const presence = derive([
    row({ characterId: 9, solarSystemId: JITA }),
    row({ characterId: 3, solarSystemId: JITA, shipTypeId: 28_606 }),
    row({ characterId: 5, solarSystemId: AMARR }),
  ]);
  expect(presence.get(JITA)?.pilots.map((p) => p.characterId)).toEqual([3, 9]);
  expect(presence.get(AMARR)?.pilots.map((p) => p.characterId)).toEqual([5]);
  expect(presence.get(JITA)?.pilots[0]?.shipTypeId).toBe(28_606);

  const deduped = derive([
    row({ characterId: 1, solarSystemId: AMARR, transitionObservedAt: NOW - 120_000 }),
    row({ characterId: 1, solarSystemId: JITA, transitionObservedAt: NOW - 30_000 }),
  ]);
  expect(deduped.get(AMARR)).toBeUndefined();
  expect(deduped.get(JITA)?.pilots).toHaveLength(1);
  expect(deduped.get(JITA)?.pilots[0]?.lastMovementAt).toBe(NOW - 30_000);

  const isolated = derivePresence({
    tracked: [
      row({ userId: 'fresh-owner', characterId: 1, location: null }),
      row({ userId: 'offline-owner', characterId: 1 }),
    ],
    coverage: new Map([
      ['fresh-owner', new Map([[1, true]])],
      ['offline-owner', new Map([[1, false]])],
    ]),
  });
  expect(isolated.size).toBe(0);

  const pilots =
    derive([row({ characterId: 7 }), row({ characterId: 8 })], {
      coverage: new Map([[7, true], [8, false]]),
    }).get(JITA)?.pilots ?? [];
  expect(friendlyRows(pilots, { '7': 'E2E Pilot' })).toEqual([
    { characterId: 7, label: 'E2E Pilot', word: 'In space' },
  ]);
});

test('payload path indexes coverage and hides while coverage is cold', () => {
  expect(derivePresenceFromPayload(undefined, undefined).size).toBe(0);

  const cold = derivePresenceFromPayload(
    { tracked: [row({ characterId: 7 })], ownTrackedCharacterIds: [] },
    undefined,
  );
  expect(cold.size).toBe(0);

  const threaded = derivePresenceFromPayload(
    { tracked: [row({ characterId: 7 })], ownTrackedCharacterIds: [7] },
    { coverage: [{ userId: OWNER, characterId: 7, covered: true }] },
  );
  expect(threaded.get(JITA)?.pilots[0]?.characterId).toBe(7);

  const index = coverageIndex({
    coverage: [
      { userId: OWNER, characterId: 3, covered: true },
      { userId: OWNER, characterId: 4, covered: false },
      { userId: 'other', characterId: 3, covered: false },
    ],
  });
  expect(index.get(OWNER)?.get(3)).toBe(true);
  expect(index.get(OWNER)?.get(4)).toBe(false);
  expect(index.get('other')?.get(3)).toBe(false);
  expect(coverageIndex(undefined).size).toBe(0);
});

test('coverage query args skip until forMap names identities, then sort them', () => {
  expect(coverageQueryArgs('map-a', undefined)).toBe('skip');
  expect(
    coverageQueryArgs('map-a', {
      ownTrackedCharacterIds: [2],
      tracked: [
        row({ userId: 'zeta', characterId: 2 }),
        row({ userId: OWNER, characterId: 9 }),
        row({ userId: OWNER, characterId: 1 }),
      ],
    }),
  ).toEqual({
    mapId: 'map-a',
    identities: [
      { userId: OWNER, characterId: 1 },
      { userId: OWNER, characterId: 9 },
      { userId: 'zeta', characterId: 2 },
    ],
  });
});
