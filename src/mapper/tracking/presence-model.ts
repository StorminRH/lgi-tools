// Pure pilot-presence derivation for the Atlas canvas (4.0.4.2.3 OW2).
//
// Last-known location is kept for collapse retention. Pins and friendlies
// only surface a pilot when the owner is present on Atlas and the character
// is ESI-online. `feedFreshAt` is that gate, delivered per owner + character
// by `mapTracking.feedFreshness` (quantized to 60s). A null or aged stamp
// means they closed Atlas or logged off, so the pin hides even when a
// characterLocation document still exists.
//
// There is no in-between map state. A shown pilot is online; otherwise they
// are absent. Docked vs In space is location, not presence.
//
// Pure and clock-injected so the SC-3.1 state matrix is a unit test; the
// provider owns subscriptions and timers.

/** The single-word status vocabulary the intelligence body renders. */
export type PresenceStatusWord = 'Docked' | 'In space';

/**
 * How long after the last coverage stamp we still treat the owner as present.
 * This is not the AFK hour. Background Atlas still heartbeats and the
 * location feed keeps finishing, so the stamp stays current for that hour.
 * This window only fires after the feed stops (tab closed, or AFK pause).
 * Sized to the 60s coverage bucket plus the 30s client tick — tight enough
 * that a closed tab does not linger, wide enough that a still-running feed
 * cannot flicker off between buckets.
 */
export const PRESENCE_FEED_GONE_AFTER_MS = 90_000;

/** The location half of one `forMap` tracked row, as presence consumes it. */
export interface TrackedLocationSnapshot {
  readonly solarSystemId: number;
  readonly stationId: number | null;
  readonly structureId: number | null;
  readonly shipTypeId: number | null;
  readonly transitionObservedAt: number | null;
  readonly observedAt: number;
}

/** One `forMap` tracked row, structurally (the model never imports Convex). */
export interface TrackedPresenceRow {
  readonly userId: string;
  readonly characterId: number;
  readonly location: TrackedLocationSnapshot | null;
}

/** One pilot's derived presence inside a system. */
export interface PresencePilot {
  readonly characterId: number;
  readonly shipTypeId: number | null;
  readonly docked: boolean;
  /** Last observed movement (transition time; falls back to last change). */
  readonly lastMovementAt: number;
}

/** Everyone present in one system, sorted by character id. */
export interface SystemPresence {
  readonly pilots: readonly PresencePilot[];
}

/** Inputs for one presence derivation pass. */
export interface PresenceInput {
  readonly tracked: readonly TrackedPresenceRow[];
  /** Per-owner-character quantized `feedFreshAt`; a missing entry means hidden. */
  readonly freshness: ReadonlyMap<string, ReadonlyMap<number, number | null>>;
  readonly now: number;
}

/**
 * Present+online: the owner's feed last covered this character and is still
 * running. A frozen stamp after they leave is not presence.
 */
export function feedIsPresent(feedFreshAt: number | null, now: number): boolean {
  return feedFreshAt !== null && now - feedFreshAt <= PRESENCE_FEED_GONE_AFTER_MS;
}

/** Prefers the most recently moved duplicate of one character. */
function betterPilot(a: PresencePilot, b: PresencePilot): PresencePilot {
  return b.lastMovementAt > a.lastMovementAt ? b : a;
}

/**
 * Derives per-system pilot presence from `forMap` rows. Rows without a joined
 * location contribute nothing; rows whose owner is not present and online
 * stay off the map even when last-known location remains.
 */
export function derivePresence(input: PresenceInput): ReadonlyMap<number, SystemPresence> {
  const byCharacter = new Map<number, { systemId: number; pilot: PresencePilot }>();

  for (const row of input.tracked) {
    if (row.location === null) continue;
    const feedFreshAt =
      input.freshness.get(row.userId)?.get(row.characterId) ?? null;
    if (!feedIsPresent(feedFreshAt, input.now)) continue;
    const pilot: PresencePilot = {
      characterId: row.characterId,
      shipTypeId: row.location.shipTypeId,
      docked: row.location.stationId !== null || row.location.structureId !== null,
      lastMovementAt: row.location.transitionObservedAt ?? row.location.observedAt,
    };
    const held = byCharacter.get(row.characterId);
    if (held === undefined || betterPilot(held.pilot, pilot) === pilot) {
      byCharacter.set(row.characterId, { systemId: row.location.solarSystemId, pilot });
    }
  }

  const pilotsBySystem = new Map<number, PresencePilot[]>();
  for (const { systemId, pilot } of byCharacter.values()) {
    const list = pilotsBySystem.get(systemId) ?? [];
    list.push(pilot);
    pilotsBySystem.set(systemId, list);
  }

  const presence = new Map<number, SystemPresence>();
  for (const [systemId, pilots] of pilotsBySystem) {
    pilots.sort((left, right) => left.characterId - right.characterId);
    presence.set(systemId, { pilots });
  }
  return presence;
}

/** The `forMap` payload shape presence consumes (undefined while loading). */
export interface TrackingPayload {
  readonly tracked: readonly TrackedPresenceRow[];
  readonly ownTrackedCharacterIds: readonly number[];
}

/** The `feedFreshness` payload shape presence consumes (undefined while loading). */
export interface FeedFreshnessPayload {
  readonly fresh: readonly {
    userId: string;
    characterId: number;
    feedFreshAt: number | null;
  }[];
}

/**
 * Indexes the coverage payload by owner then character id. An unloaded
 * payload yields an empty index, which hides everyone — the honest verdict
 * while the coverage subscription is still cold.
 */
export function feedFreshnessIndex(
  payload: FeedFreshnessPayload | undefined,
): ReadonlyMap<string, ReadonlyMap<number, number | null>> {
  const index = new Map<string, Map<number, number | null>>();
  for (const entry of payload?.fresh ?? []) {
    const byCharacter = index.get(entry.userId) ?? new Map();
    byCharacter.set(entry.characterId, entry.feedFreshAt);
    index.set(entry.userId, byCharacter);
  }
  return index;
}

/**
 * Presence from possibly-unloaded `forMap` + `feedFreshness` payloads — the
 * provider's memo body, kept pure and tested so the component seam stays
 * branch-free.
 */
export function derivePresenceFromPayload(
  payload: TrackingPayload | undefined,
  freshness: FeedFreshnessPayload | undefined,
  now: number,
): ReadonlyMap<number, SystemPresence> {
  return derivePresence({
    tracked: payload?.tracked ?? [],
    freshness: feedFreshnessIndex(freshness),
    now,
  });
}

/** The one status word a pilot row displays: where they are, not whether. */
export function presenceStatusWord(pilot: PresencePilot): PresenceStatusWord {
  return pilot.docked ? 'Docked' : 'In space';
}

/** One rendered friendlies row: resolved label + the single status word. */
export interface FriendlyRowModel {
  readonly characterId: number;
  readonly label: string;
  readonly word: PresenceStatusWord;
}

/**
 * Rows for the intelligence body's friendlies readout: entity names win,
 * the bare character id is the honest fallback while a name is cold.
 */
export function friendlyRows(
  pilots: readonly PresencePilot[],
  names: Record<string, string>,
): readonly FriendlyRowModel[] {
  return pilots.map((pilot) => ({
    characterId: pilot.characterId,
    label: names[String(pilot.characterId)] ?? String(pilot.characterId),
    word: presenceStatusWord(pilot),
  }));
}
