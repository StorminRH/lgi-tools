import { describe, expect, it } from 'vitest';
import {
  derivePresence,
  derivePresenceFromPayload,
  friendlyRows,
  PRESENCE_FEED_STALE_AFTER_MS,
  presenceBadgeTone,
  presenceStatusWord,
  type TrackedPresenceRow,
} from './presence-model';

const NOW = 1_700_000_000_000;
const JITA = 30_000_142;
const AMARR = 30_002_187;

function row(overrides: {
  characterId: number;
  feedFreshAt?: number | null;
  solarSystemId?: number;
  stationId?: number | null;
  structureId?: number | null;
  shipTypeId?: number | null;
  transitionObservedAt?: number | null;
  observedAt?: number;
  location?: null;
}): TrackedPresenceRow {
  if (overrides.location === null) {
    return { characterId: overrides.characterId, feedFreshAt: overrides.feedFreshAt ?? null, location: null };
  }
  return {
    characterId: overrides.characterId,
    feedFreshAt: overrides.feedFreshAt === undefined ? NOW - 1_000 : overrides.feedFreshAt,
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
}) {
  return derivePresence({
    tracked,
    now: NOW,
    ownCharacterIds: options?.ownCharacterIds ?? [],
    ownAfk: options?.ownAfk ?? false,
  });
}

// ── SC-3.1 — the full honesty matrix ─────────────────────────────────────────
describe('derivePresence state matrix', () => {
  it('renders a stationary pilot live while the feed is fresh, however old the movement', () => {
    const presence = derive([
      row({ characterId: 1, feedFreshAt: NOW - 5_000, transitionObservedAt: NOW - 86_400_000 }),
    ]);
    const pilot = presence.get(JITA)?.pilots[0];
    expect(pilot?.state).toBe('live');
    expect(pilot?.lastMovementAt).toBe(NOW - 86_400_000);
    expect(pilot && presenceStatusWord(pilot)).toBe('In space');
  });

  it('accepts feed age exactly at the boundary and flips stale one tick past it', () => {
    const boundary = derive([
      row({ characterId: 1, feedFreshAt: NOW - PRESENCE_FEED_STALE_AFTER_MS }),
    ]);
    const past = derive([
      row({ characterId: 1, feedFreshAt: NOW - PRESENCE_FEED_STALE_AFTER_MS - 1 }),
    ]);
    expect(boundary.get(JITA)?.pilots[0]?.state).toBe('live');
    expect(past.get(JITA)?.pilots[0]?.state).toBe('stale');
  });

  it('renders an absent sync subject as stale, never as a stationary pilot', () => {
    const pilot = derive([row({ characterId: 1, feedFreshAt: null })]).get(JITA)?.pilots[0];
    expect(pilot?.state).toBe('stale');
    expect(pilot && presenceStatusWord(pilot)).toBe('Stale');
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
      [row({ characterId: 1, feedFreshAt: null, stationId: 60_003_760 })],
      { ownCharacterIds: [1], ownAfk: true },
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

  it('collapses a duplicated character to its freshest evidence', () => {
    const presence = derive([
      row({ characterId: 1, feedFreshAt: null, solarSystemId: AMARR }),
      row({ characterId: 1, feedFreshAt: NOW - 1_000, solarSystemId: JITA }),
    ]);
    expect(presence.get(AMARR)).toBeUndefined();
    expect(presence.get(JITA)?.pilots).toHaveLength(1);
    expect(presence.get(JITA)?.pilots[0]?.state).toBe('live');
  });

  it('carries the ship type through for future readouts', () => {
    const pilot = derive([row({ characterId: 1, shipTypeId: 28_606 })]).get(JITA)?.pilots[0];
    expect(pilot?.shipTypeId).toBe(28_606);
  });
});

describe('derivePresenceFromPayload', () => {
  it('yields an empty map while the subscription has not answered', () => {
    expect(derivePresenceFromPayload(undefined, NOW, false).size).toBe(0);
  });

  it('threads payload rows, own ids, and the AFK verdict through', () => {
    const presence = derivePresenceFromPayload(
      { tracked: [row({ characterId: 7 })], ownTrackedCharacterIds: [7] },
      NOW,
      true,
    );
    expect(presence.get(JITA)?.pilots[0]?.ownAfk).toBe(true);
  });
});

describe('friendlyRows', () => {
  it('labels rows with resolved names and falls back to the bare character id', () => {
    const pilots = derive([
      row({ characterId: 7 }),
      row({ characterId: 8, feedFreshAt: null }),
    ]).get(JITA)?.pilots ?? [];
    const rows = friendlyRows(pilots, { '7': 'E2E Pilot' });
    expect(rows).toEqual([
      { characterId: 7, label: 'E2E Pilot', word: 'In space' },
      { characterId: 8, label: '8', word: 'Stale' },
    ]);
  });
});

describe('presenceBadgeTone', () => {
  it('stays green while anyone is live and dims once everyone is stale', () => {
    const live = derive([
      row({ characterId: 1, feedFreshAt: null }),
      row({ characterId: 2, feedFreshAt: NOW }),
    ]).get(JITA);
    const stale = derive([
      row({ characterId: 1, feedFreshAt: null }),
      row({ characterId: 2, feedFreshAt: NOW - PRESENCE_FEED_STALE_AFTER_MS - 1 }),
    ]).get(JITA);
    expect(live && presenceBadgeTone(live)).toBe('green');
    expect(stale && presenceBadgeTone(stale)).toBe('neutral');
  });
});
