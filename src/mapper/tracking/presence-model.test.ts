import { expect, test } from 'vitest';
import {
  derivePresence,
  derivePresenceFromPayload,
  feedFreshnessIndex,
  feedIsPresent,
  friendlyRows,
  PRESENCE_FEED_GONE_AFTER_MS,
  presenceStatusWord,
  type TrackedPresenceRow,
} from './presence-model';

const NOW = 1_700_000_000_000;
const JITA = 30_000_142;
const AMARR = 30_002_187;
const OWNER = 'owner';
/** Older than PRESENCE_FEED_GONE_AFTER_MS — the feed has stopped. */
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
    /** Per-character feed freshness; defaults to present for every row. */
    freshness?: ReadonlyMap<number, number | null>;
  },
) {
  return derivePresence({
    tracked,
    freshness: new Map([
      [
        OWNER,
        options?.freshness ??
          new Map(tracked.map((entry) => [entry.characterId, NOW - 1_000])),
      ],
    ]),
    now: NOW,
  });
}

test('presence honesty: present+online shows, everything else hides', () => {
  const stationary = derive(
    [
      row({
        characterId: 1,
        transitionObservedAt: NOW - 86_400_000,
        observedAt: NOW - 86_400_000,
      }),
    ],
    { freshness: new Map([[1, NOW - 5_000]]) },
  ).get(JITA)?.pilots[0];
  expect(stationary?.lastMovementAt).toBe(NOW - 86_400_000);
  expect(stationary && presenceStatusWord(stationary)).toBe('In space');

  const boundary = derive(
    [row({ characterId: 1, transitionObservedAt: OLD, observedAt: OLD })],
    { freshness: new Map([[1, NOW - PRESENCE_FEED_GONE_AFTER_MS]]) },
  );
  const past = derive(
    [row({ characterId: 1, transitionObservedAt: OLD, observedAt: OLD })],
    { freshness: new Map([[1, NOW - PRESENCE_FEED_GONE_AFTER_MS - 1]]) },
  );
  expect(boundary.get(JITA)?.pilots).toHaveLength(1);
  expect(past.size).toBe(0);

  const nullEntry = derive(
    [row({ characterId: 1, transitionObservedAt: OLD, observedAt: OLD })],
    { freshness: new Map([[1, null]]) },
  );
  const missingEntry = derive(
    [row({ characterId: 1, transitionObservedAt: OLD, observedAt: OLD })],
    { freshness: new Map() },
  );
  expect(nullEntry.size).toBe(0);
  expect(missingEntry.size).toBe(0);

  // Recent observedAt alone cannot resurrect an uncovered or departed owner.
  expect(
    derive([row({ characterId: 1, observedAt: NOW - 30_000 })], {
      freshness: new Map([[1, null]]),
    }).size,
  ).toBe(0);
  expect(
    derive([row({ characterId: 1, observedAt: NOW - 30_000 })], {
      freshness: new Map([[1, NOW - PRESENCE_FEED_GONE_AFTER_MS - 1]]),
    }).size,
  ).toBe(0);

  expect(feedIsPresent(NOW - 1_000, NOW)).toBe(true);
  expect(feedIsPresent(null, NOW)).toBe(false);
  expect(feedIsPresent(NOW - PRESENCE_FEED_GONE_AFTER_MS - 1, NOW)).toBe(false);
});

test('presence honesty: docking is location, not a third presence state', () => {
  const station = derive([row({ characterId: 1, stationId: 60_003_760 })]).get(JITA)?.pilots[0];
  const structure = derive([row({ characterId: 1, structureId: 1_035_466_617_946 })]).get(JITA)
    ?.pilots[0];
  expect(station?.docked).toBe(true);
  expect(structure?.docked).toBe(true);
  expect(station && presenceStatusWord(station)).toBe('Docked');

  expect(derive([row({ characterId: 1, location: null })]).size).toBe(0);
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
      row({
        userId: 'gone-owner',
        characterId: 1,
        transitionObservedAt: OLD,
        observedAt: OLD,
      }),
    ],
    freshness: new Map<string, ReadonlyMap<number, number | null>>([
      ['fresh-owner', new Map([[1, NOW - 1_000]])],
      ['gone-owner', new Map([[1, NOW - PRESENCE_FEED_GONE_AFTER_MS - 1]])],
    ]),
    now: NOW,
  });
  expect(isolated.size).toBe(0);

  const uncoveredIsolated = derivePresence({
    tracked: [
      row({
        userId: 'offline-owner',
        characterId: 1,
        transitionObservedAt: OLD,
        observedAt: OLD,
      }),
    ],
    freshness: new Map<string, ReadonlyMap<number, number | null>>([
      ['offline-owner', new Map([[1, null]])],
    ]),
    now: NOW,
  });
  expect(uncoveredIsolated.size).toBe(0);

  const pilots =
    derive(
      [
        row({ characterId: 7 }),
        row({ characterId: 8, transitionObservedAt: OLD, observedAt: OLD }),
      ],
      {
        freshness: new Map([
          [7, NOW - 1_000],
          [8, NOW - PRESENCE_FEED_GONE_AFTER_MS - 1],
        ]),
      },
    ).get(JITA)?.pilots ?? [];
  expect(friendlyRows(pilots, { '7': 'E2E Pilot' })).toEqual([
    { characterId: 7, label: 'E2E Pilot', word: 'In space' },
  ]);
  expect(
    derive(
      [
        row({ characterId: 7 }),
        row({ characterId: 8, transitionObservedAt: OLD, observedAt: OLD }),
      ],
      { freshness: new Map([[7, NOW - 1_000], [8, null]]) },
    )
      .get(JITA)
      ?.pilots.map((pilot) => pilot.characterId),
  ).toEqual([7]);
});

test('payload path indexes freshness and hides while coverage is cold', () => {
  expect(derivePresenceFromPayload(undefined, undefined, NOW).size).toBe(0);

  const cold = derivePresenceFromPayload(
    {
      tracked: [row({ characterId: 7, transitionObservedAt: OLD, observedAt: OLD })],
      ownTrackedCharacterIds: [],
    },
    undefined,
    NOW,
  );
  expect(cold.size).toBe(0);

  const threaded = derivePresenceFromPayload(
    { tracked: [row({ characterId: 7 })], ownTrackedCharacterIds: [7] },
    { fresh: [{ userId: OWNER, characterId: 7, feedFreshAt: NOW - 1_000 }] },
    NOW,
  );
  expect(threaded.get(JITA)?.pilots[0]?.characterId).toBe(7);

  const index = feedFreshnessIndex({
    fresh: [
      { userId: OWNER, characterId: 3, feedFreshAt: NOW },
      { userId: OWNER, characterId: 4, feedFreshAt: null },
      { userId: 'other', characterId: 3, feedFreshAt: null },
    ],
  });
  expect(index.get(OWNER)?.get(3)).toBe(NOW);
  expect(index.get(OWNER)?.get(4)).toBeNull();
  expect(index.get('other')?.get(3)).toBeNull();
  expect(feedFreshnessIndex(undefined).size).toBe(0);
});
