import { expect, test } from 'vitest';
import {
  derivePresence,
  derivePresenceFromPayload,
  friendlyRows,
  presenceBadgeTone,
  presenceStatusWord,
  type TrackedPresenceRow,
} from './presence-model';

const NOW = 1_700_000_000_000;
const JITA = 30_000_142;
const AMARR = 30_002_187;
const OWNER = 'owner';
const OLD = NOW - 400_000;

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
  options?: {
    ownCharacterIds?: number[];
    ownAfk?: boolean;
  },
) {
  return derivePresence({
    tracked,
    ownCharacterIds: options?.ownCharacterIds ?? [],
    ownAfk: options?.ownAfk ?? false,
  });
}

test('presence uses last-known location and keeps a parked ship on the map', () => {
  const stationary = derive([
    row({
      characterId: 1,
      transitionObservedAt: NOW - 86_400_000,
      observedAt: NOW - 86_400_000,
    }),
  ]).get(JITA)?.pilots[0];
  expect(stationary?.state).toBe('live');
  expect(stationary?.lastMovementAt).toBe(NOW - 86_400_000);
  expect(stationary && presenceStatusWord(stationary)).toBe('In space');

  expect(derive([row({ characterId: 1, location: null })]).size).toBe(0);
});

test('presence honesty: docking and location-as-proof', () => {
  const station = derive([row({ characterId: 1, stationId: 60_003_760 })]).get(JITA)?.pilots[0];
  const structure = derive([row({ characterId: 1, structureId: 1_035_466_617_946 })]).get(JITA)
    ?.pilots[0];
  expect(station?.docked).toBe(true);
  expect(structure?.docked).toBe(true);
  expect(station && presenceStatusWord(station)).toBe('Docked');
});

test('presence honesty: AFK marks own pilots only', () => {
  const afkPresence = derive([row({ characterId: 1 }), row({ characterId: 2 })], {
    ownCharacterIds: [1],
    ownAfk: true,
  });
  const [own, other] = afkPresence.get(JITA)?.pilots ?? [];
  expect(own?.ownAfk).toBe(true);
  expect(other?.ownAfk).toBe(false);
  expect(own && presenceStatusWord(own)).toBe('AFK');
  expect(other && presenceStatusWord(other)).toBe('In space');

  const afkDocked = derive([row({ characterId: 1, stationId: 60_003_760 })], {
    ownCharacterIds: [1],
    ownAfk: true,
  }).get(JITA)?.pilots[0];
  expect(afkDocked && presenceStatusWord(afkDocked)).toBe('AFK');
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
      row({ userId: 'empty-owner', characterId: 1, location: null }),
      row({
        userId: 'held-owner',
        characterId: 1,
        transitionObservedAt: OLD,
        observedAt: OLD,
      }),
    ],
    ownCharacterIds: [],
    ownAfk: false,
  });
  expect(isolated.get(JITA)?.pilots[0]?.state).toBe('live');

  const pilots =
    derive([
      row({ characterId: 7 }),
      row({ characterId: 8, transitionObservedAt: OLD, observedAt: OLD }),
    ]).get(JITA)?.pilots ?? [];
  expect(friendlyRows(pilots, { '7': 'E2E Pilot' })).toEqual([
    { characterId: 7, label: 'E2E Pilot', word: 'In space' },
    { characterId: 8, label: '8', word: 'In space' },
  ]);

  const both = derive([
    row({ characterId: 1, transitionObservedAt: OLD, observedAt: OLD }),
    row({ characterId: 2, transitionObservedAt: OLD, observedAt: OLD }),
  ]).get(JITA);
  expect(both?.pilots.map((pilot) => pilot.characterId)).toEqual([1, 2]);
  expect(both && presenceBadgeTone(both)).toBe('green');
});

test('payload path threads AFK through a loaded forMap overlay', () => {
  expect(derivePresenceFromPayload(undefined, false).size).toBe(0);

  const held = derivePresenceFromPayload(
    {
      tracked: [row({ characterId: 7, transitionObservedAt: OLD, observedAt: OLD })],
      ownTrackedCharacterIds: [],
    },
    false,
  );
  expect(held.get(JITA)?.pilots[0]?.state).toBe('live');

  const threaded = derivePresenceFromPayload(
    { tracked: [row({ characterId: 7 })], ownTrackedCharacterIds: [7] },
    true,
  );
  const pilot = threaded.get(JITA)?.pilots[0];
  expect(pilot?.state).toBe('live');
  expect(pilot?.ownAfk).toBe(true);
});
