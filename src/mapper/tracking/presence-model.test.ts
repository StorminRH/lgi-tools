import { expect, test } from 'vitest';
import {
  derivePresence,
  derivePresenceFromPayload,
  feedFreshnessIndex,
  friendlyRows,
  PRESENCE_FEED_STALE_AFTER_MS,
  presenceBadgeTone,
  presenceStatusWord,
  type TrackedPresenceRow,
} from './presence-model';

const NOW = 1_700_000_000_000;
const JITA = 30_000_142;
const AMARR = 30_002_187;
const OWNER = 'owner';
/** Older than PRESENCE_FEED_STALE_AFTER_MS — proves nothing about the feed. */
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
    /** Per-character feed freshness; defaults to fresh for every row. */
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
    ownCharacterIds: options?.ownCharacterIds ?? [],
    ownAfk: options?.ownAfk ?? false,
  });
}

test('presence honesty: feed freshness decides live vs stale', () => {
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
  expect(stationary?.state).toBe('live');
  expect(stationary?.lastMovementAt).toBe(NOW - 86_400_000);
  expect(stationary && presenceStatusWord(stationary)).toBe('In space');

  const boundary = derive(
    [row({ characterId: 1, transitionObservedAt: OLD, observedAt: OLD })],
    { freshness: new Map([[1, NOW - PRESENCE_FEED_STALE_AFTER_MS]]) },
  );
  const past = derive(
    [row({ characterId: 1, transitionObservedAt: OLD, observedAt: OLD })],
    { freshness: new Map([[1, NOW - PRESENCE_FEED_STALE_AFTER_MS - 1]]) },
  );
  expect(boundary.get(JITA)?.pilots[0]?.state).toBe('live');
  expect(past.get(JITA)?.pilots[0]?.state).toBe('stale');

  const nullEntry = derive(
    [row({ characterId: 1, transitionObservedAt: OLD, observedAt: OLD })],
    { freshness: new Map([[1, null]]) },
  );
  const missingEntry = derive(
    [row({ characterId: 1, transitionObservedAt: OLD, observedAt: OLD })],
    { freshness: new Map() },
  );
  // Uncovered (logged off / not sampled): last-known location must not surface.
  expect(nullEntry.size).toBe(0);
  expect(missingEntry.size).toBe(0);

  // Recent observedAt alone cannot resurrect an uncovered pilot.
  expect(
    derive([row({ characterId: 1, observedAt: NOW - 30_000 })], {
      freshness: new Map([[1, null]]),
    }).size,
  ).toBe(0);

  // Covered + recent observation stays live even when the bucket is aging.
  expect(
    derive([row({ characterId: 1, observedAt: NOW - 30_000 })], {
      freshness: new Map([[1, NOW - PRESENCE_FEED_STALE_AFTER_MS - 1]]),
    }).get(JITA)?.pilots[0]?.state,
  ).toBe('live');
});

test('presence honesty: docking and location-as-proof', () => {
  const station = derive([row({ characterId: 1, stationId: 60_003_760 })]).get(JITA)?.pilots[0];
  const structure = derive([row({ characterId: 1, structureId: 1_035_466_617_946 })]).get(JITA)
    ?.pilots[0];
  expect(station?.docked).toBe(true);
  expect(structure?.docked).toBe(true);
  expect(station && presenceStatusWord(station)).toBe('Docked');

  expect(derive([row({ characterId: 1, location: null })]).size).toBe(0);
});

test('presence honesty: AFK marks own pilots only and yields to staleness', () => {
  const afkPresence = derive([row({ characterId: 1 }), row({ characterId: 2 })], {
    ownCharacterIds: [1],
    ownAfk: true,
  });
  const [own, other] = afkPresence.get(JITA)?.pilots ?? [];
  expect(own?.ownAfk).toBe(true);
  expect(other?.ownAfk).toBe(false);
  expect(own && presenceStatusWord(own)).toBe('AFK');
  expect(other && presenceStatusWord(other)).toBe('In space');

  const staleAfkDocked = derive(
    [
      row({
        characterId: 1,
        stationId: 60_003_760,
        transitionObservedAt: OLD,
        observedAt: OLD,
      }),
    ],
    {
      ownCharacterIds: [1],
      ownAfk: true,
      freshness: new Map([[1, NOW - PRESENCE_FEED_STALE_AFTER_MS - 1]]),
    },
  ).get(JITA)?.pilots[0];
  const afkDocked = derive([row({ characterId: 1, stationId: 60_003_760 })], {
    ownCharacterIds: [1],
    ownAfk: true,
  }).get(JITA)?.pilots[0];
  const uncoveredAfk = derive(
    [
      row({
        characterId: 1,
        stationId: 60_003_760,
        transitionObservedAt: OLD,
        observedAt: OLD,
      }),
    ],
    { ownCharacterIds: [1], ownAfk: true, freshness: new Map([[1, null]]) },
  );
  expect(staleAfkDocked && presenceStatusWord(staleAfkDocked)).toBe('Stale');
  expect(afkDocked && presenceStatusWord(afkDocked)).toBe('AFK');
  expect(uncoveredAfk.size).toBe(0);
});

test('presence shape groups, dedupes, isolates owners, and labels friendlies', () => {
  const presence = derive([
    row({ characterId: 9, solarSystemId: JITA }),
    row({ characterId: 3, solarSystemId: JITA, shipTypeId: 28_606 }),
    row({ characterId: 5, solarSystemId: AMARR }),
  ]);
  expect(presence.get(JITA)?.pilots.map((p) => p.characterId)).toEqual([3, 9]);
  expect(presence.get(AMARR)?.pilots.map((p) => p.characterId)).toEqual([5]);
  // Distinctive override (not the row() default) proves ship type passes through.
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
        userId: 'stale-owner',
        characterId: 1,
        transitionObservedAt: OLD,
        observedAt: OLD,
      }),
    ],
    freshness: new Map<string, ReadonlyMap<number, number | null>>([
      ['fresh-owner', new Map([[1, NOW - 1_000]])],
      ['stale-owner', new Map([[1, NOW - PRESENCE_FEED_STALE_AFTER_MS - 1]])],
    ]),
    now: NOW,
    ownCharacterIds: [],
    ownAfk: false,
  });
  expect(isolated.get(JITA)?.pilots[0]?.state).toBe('stale');

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
    ownCharacterIds: [],
    ownAfk: false,
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
          [8, NOW - PRESENCE_FEED_STALE_AFTER_MS - 1],
        ]),
      },
    ).get(JITA)?.pilots ?? [];
  expect(friendlyRows(pilots, { '7': 'E2E Pilot' })).toEqual([
    { characterId: 7, label: 'E2E Pilot', word: 'In space' },
    { characterId: 8, label: '8', word: 'Stale' },
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

  const quiet = { transitionObservedAt: OLD, observedAt: OLD } as const;
  const live = derive(
    [row({ characterId: 1, ...quiet }), row({ characterId: 2, ...quiet })],
    { freshness: new Map([[1, null], [2, NOW]]) },
  ).get(JITA);
  const stale = derive(
    [row({ characterId: 1, ...quiet }), row({ characterId: 2, ...quiet })],
    {
      freshness: new Map([
        [1, null],
        [2, NOW - PRESENCE_FEED_STALE_AFTER_MS - 1],
      ]),
    },
  ).get(JITA);
  expect(live?.pilots.map((pilot) => pilot.characterId)).toEqual([2]);
  expect(stale?.pilots.map((pilot) => pilot.characterId)).toEqual([2]);
  expect(live && presenceBadgeTone(live)).toBe('green');
  expect(stale && presenceBadgeTone(stale)).toBe('neutral');
});

test('payload path indexes freshness and threads AFK through cold subscriptions', () => {
  expect(derivePresenceFromPayload(undefined, undefined, NOW, false).size).toBe(0);

  const cold = derivePresenceFromPayload(
    {
      tracked: [row({ characterId: 7, transitionObservedAt: OLD, observedAt: OLD })],
      ownTrackedCharacterIds: [],
    },
    undefined,
    NOW,
    false,
  );
  // Cold freshness: coverage unknown → do not paint last-known location.
  expect(cold.size).toBe(0);

  const threaded = derivePresenceFromPayload(
    { tracked: [row({ characterId: 7 })], ownTrackedCharacterIds: [7] },
    { fresh: [{ userId: OWNER, characterId: 7, feedFreshAt: NOW - 1_000 }] },
    NOW,
    true,
  );
  const pilot = threaded.get(JITA)?.pilots[0];
  expect(pilot?.state).toBe('live');
  expect(pilot?.ownAfk).toBe(true);

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
