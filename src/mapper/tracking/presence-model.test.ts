import { describe, expect, it } from 'vitest';
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

function derive(tracked: TrackedPresenceRow[], options?: {
  ownCharacterIds?: number[];
  ownAfk?: boolean;
  /** Per-character feed freshness; defaults to fresh for every row. */
  freshness?: ReadonlyMap<number, number | null>;
}) {
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

// ── SC-3.1 — the full honesty matrix ─────────────────────────────────────────
describe('derivePresence state matrix', () => {
  it('renders a stationary pilot live while the feed is fresh, however old the movement', () => {
    const presence = derive(
      [
        row({
          characterId: 1,
          transitionObservedAt: NOW - 86_400_000,
          observedAt: NOW - 86_400_000,
        }),
      ],
      { freshness: new Map([[1, NOW - 5_000]]) },
    );
    const pilot = presence.get(JITA)?.pilots[0];
    expect(pilot?.state).toBe('live');
    expect(pilot?.lastMovementAt).toBe(NOW - 86_400_000);
    expect(pilot && presenceStatusWord(pilot)).toBe('In space');
  });

  it('accepts feed age exactly at the boundary and flips stale one tick past it', () => {
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
  });

  it('renders an absent or uncovered feed as stale once the location is also quiet', () => {
    // Explicit null (subject exists, character not covered) and a missing
    // entry (no subject at all) are both the stale verdict when no recent
    // location change vouches for the feed either.
    const nullEntry = derive(
      [row({ characterId: 1, transitionObservedAt: OLD, observedAt: OLD })],
      { freshness: new Map([[1, null]]) },
    ).get(JITA)?.pilots[0];
    const missingEntry = derive(
      [row({ characterId: 1, transitionObservedAt: OLD, observedAt: OLD })],
      { freshness: new Map() },
    ).get(JITA)?.pilots[0];
    expect(nullEntry?.state).toBe('stale');
    expect(missingEntry?.state).toBe('stale');
    expect(nullEntry && presenceStatusWord(nullEntry)).toBe('Stale');
  });

  it('reads a fresh location change as proof of feed coverage while the freshness feed is cold', () => {
    // A change the feed just wrote IS an observation of the character: the
    // pilot stays live through a cold or clobbered freshness subscription,
    // and goes stale once both signals age out.
    const justMoved = derive(
      [row({ characterId: 1, observedAt: NOW - 30_000 })],
      { freshness: new Map([[1, null]]) },
    ).get(JITA)?.pilots[0];
    expect(justMoved?.state).toBe('live');
  });

  it('flags docked pilots from either a station or a structure id', () => {
    const station = derive([row({ characterId: 1, stationId: 60_003_760 })]).get(JITA)?.pilots[0];
    const structure = derive([row({ characterId: 1, structureId: 1_035_466_617_946 })])
      .get(JITA)?.pilots[0];
    expect(station?.docked).toBe(true);
    expect(structure?.docked).toBe(true);
    expect(station && presenceStatusWord(station)).toBe('Docked');
  });

  it('overlays local AFK on own characters only', () => {
    const presence = derive(
      [row({ characterId: 1 }), row({ characterId: 2 })],
      { ownCharacterIds: [1], ownAfk: true },
    );
    const [own, other] = presence.get(JITA)?.pilots ?? [];
    expect(own?.ownAfk).toBe(true);
    expect(other?.ownAfk).toBe(false);
    expect(own && presenceStatusWord(own)).toBe('AFK');
    expect(other && presenceStatusWord(other)).toBe('In space');
  });

  it('applies the operator precedence Stale > AFK > Docked > In space', () => {
    const staleAfkDocked = derive(
      [
        row({
          characterId: 1,
          stationId: 60_003_760,
          transitionObservedAt: OLD,
          observedAt: OLD,
        }),
      ],
      { ownCharacterIds: [1], ownAfk: true, freshness: new Map([[1, null]]) },
    ).get(JITA)?.pilots[0];
    const afkDocked = derive(
      [row({ characterId: 1, stationId: 60_003_760 })],
      { ownCharacterIds: [1], ownAfk: true },
    ).get(JITA)?.pilots[0];
    expect(staleAfkDocked && presenceStatusWord(staleAfkDocked)).toBe('Stale');
    expect(afkDocked && presenceStatusWord(afkDocked)).toBe('AFK');
  });

  it('drops rows without a joined location (forged rows disclose nothing)', () => {
    const presence = derive([row({ characterId: 1, location: null })]);
    expect(presence.size).toBe(0);
  });
});

describe('derivePresence shape', () => {
  it('groups pilots by system and sorts them by character id', () => {
    const presence = derive([
      row({ characterId: 9, solarSystemId: JITA }),
      row({ characterId: 3, solarSystemId: JITA }),
      row({ characterId: 5, solarSystemId: AMARR }),
    ]);
    expect(presence.get(JITA)?.pilots.map((p) => p.characterId)).toEqual([3, 9]);
    expect(presence.get(AMARR)?.pilots.map((p) => p.characterId)).toEqual([5]);
  });

  it('collapses a duplicated character to its most recently moved evidence', () => {
    // Freshness is per character, so duplicate rows share a state; the
    // movement-recency tiebreak decides which row's system wins.
    const presence = derive([
      row({ characterId: 1, solarSystemId: AMARR, transitionObservedAt: NOW - 120_000 }),
      row({ characterId: 1, solarSystemId: JITA, transitionObservedAt: NOW - 30_000 }),
    ]);
    expect(presence.get(AMARR)).toBeUndefined();
    expect(presence.get(JITA)?.pilots).toHaveLength(1);
    expect(presence.get(JITA)?.pilots[0]?.lastMovementAt).toBe(NOW - 30_000);
  });

  it('never applies one owner\'s fresh feed to another owner\'s stale location', () => {
    const presence = derivePresence({
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
        ['stale-owner', new Map([[1, null]])],
      ]),
      now: NOW,
      ownCharacterIds: [],
      ownAfk: false,
    });

    expect(presence.get(JITA)?.pilots[0]?.state).toBe('stale');
  });

  it('carries the ship type through for future readouts', () => {
    const pilot = derive([row({ characterId: 1, shipTypeId: 28_606 })]).get(JITA)?.pilots[0];
    expect(pilot?.shipTypeId).toBe(28_606);
  });
});

describe('derivePresenceFromPayload', () => {
  it('yields an empty map while the tracking subscription has not answered', () => {
    expect(derivePresenceFromPayload(undefined, undefined, NOW, false).size).toBe(0);
  });

  it('reads a cold freshness subscription as stale once the location is also quiet', () => {
    const presence = derivePresenceFromPayload(
      {
        tracked: [
          row({ characterId: 7, transitionObservedAt: OLD, observedAt: OLD }),
        ],
        ownTrackedCharacterIds: [],
      },
      undefined,
      NOW,
      false,
    );
    expect(presence.get(JITA)?.pilots[0]?.state).toBe('stale');
  });

  it('threads payload rows, freshness, own ids, and the AFK verdict through', () => {
    const presence = derivePresenceFromPayload(
      { tracked: [row({ characterId: 7 })], ownTrackedCharacterIds: [7] },
      { fresh: [{ userId: OWNER, characterId: 7, feedFreshAt: NOW - 1_000 }] },
      NOW,
      true,
    );
    const pilot = presence.get(JITA)?.pilots[0];
    expect(pilot?.state).toBe('live');
    expect(pilot?.ownAfk).toBe(true);
  });

  it('indexes the freshness payload by owner then character id', () => {
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
});

describe('friendlyRows', () => {
  it('labels rows with resolved names and falls back to the bare character id', () => {
    const pilots = derive(
      [
        row({ characterId: 7 }),
        row({ characterId: 8, transitionObservedAt: OLD, observedAt: OLD }),
      ],
      { freshness: new Map([[7, NOW - 1_000], [8, null]]) },
    ).get(JITA)?.pilots ?? [];
    const rows = friendlyRows(pilots, { '7': 'E2E Pilot' });
    expect(rows).toEqual([
      { characterId: 7, label: 'E2E Pilot', word: 'In space' },
      { characterId: 8, label: '8', word: 'Stale' },
    ]);
  });
});

describe('presenceBadgeTone', () => {
  it('stays green while anyone is live and dims once everyone is stale', () => {
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
    expect(live && presenceBadgeTone(live)).toBe('green');
    expect(stale && presenceBadgeTone(stale)).toBe('neutral');
  });
});
