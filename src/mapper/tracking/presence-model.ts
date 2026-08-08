// Pure pilot-presence derivation for the Atlas canvas (4.0.4.2.3 OW2).
//
// Staleness honesty is the whole point of this module: `observedAt` is
// LAST-CHANGE time, so a stationary pilot and a paused tracker look identical
// through it. The primary honest signal is `feedFreshAt` — delivered per
// owner + character by the `mapTracking.feedFreshness` subscription
// (quantized to 60s buckets so the hot per-run subject stamp cannot churn the
// wire), and non-null only when the owner's last run actually covered that
// character (online + location/304 observed). A null `feedFreshAt` means the
// pilot is not currently covered — logged off or not sampled — so presence
// does not surface them even when a last-known `characterLocation` still
// exists for collapse retention.
// A RECENT `observedAt` upgrades a covered pilot to `live` while the
// freshness bucket is still aging in: a change the feed just wrote proves
// observation at that moment. Coverage is still required to appear at all.
//
// Pure and clock-injected so the SC-3.1 state matrix is a unit test; the
// provider owns subscriptions and timers.

/** Honest feed verdict for one tracked pilot. */
export type PresenceState = 'live' | 'stale';

/** The single-word status vocabulary the intelligence body renders. */
export type PresenceStatusWord = 'Stale' | 'AFK' | 'Docked' | 'In space';

/**
 * Feed age past which a pilot renders stale. The characterLocation cadence is
 * seconds while hot, so three missed minutes means the tracker paused (AFK
 * gate, closed tab, cold subject) rather than jitter. `feedFreshAt` arrives
 * quantized to 60s buckets, so detection lands within one bucket past this
 * threshold — deliberately coarser than the quantum. Pinned; no runtime
 * configuration surface (operator direction, plan PD-2 family).
 */
export const PRESENCE_FEED_STALE_AFTER_MS = 180_000;

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
  readonly state: PresenceState;
  /** True only for the viewer's own characters while the local AFK gate is up. */
  readonly ownAfk: boolean;
}

/** Everyone present in one system, sorted by character id. */
export interface SystemPresence {
  readonly pilots: readonly PresencePilot[];
}

/** Inputs for one presence derivation pass. */
export interface PresenceInput {
  readonly tracked: readonly TrackedPresenceRow[];
  /** Per-owner-character quantized `feedFreshAt`; a missing entry means stale. */
  readonly freshness: ReadonlyMap<string, ReadonlyMap<number, number | null>>;
  readonly now: number;
  readonly ownCharacterIds: readonly number[];
  /** The local AFK gate's prompt-open/paused verdict (own characters only). */
  readonly ownAfk: boolean;
}

/**
 * A covered pilot is live when the feed bucket is still within the stale
 * window, or when the location document itself changed recently — a change
 * the feed just wrote IS proof it observed the character at that moment.
 * Callers must only invoke this for covered pilots (`feedFreshAt !== null`).
 */
function presenceState(
  feedFreshAt: number,
  observedAt: number,
  now: number,
): PresenceState {
  const freshFeed = now - feedFreshAt <= PRESENCE_FEED_STALE_AFTER_MS;
  const freshObservation = now - observedAt <= PRESENCE_FEED_STALE_AFTER_MS;
  return freshFeed || freshObservation ? 'live' : 'stale';
}

/** Prefers the live, then most recently moved, duplicate of one character. */
function betterPilot(a: PresencePilot, b: PresencePilot): PresencePilot {
  if (a.state !== b.state) return a.state === 'live' ? a : b;
  return b.lastMovementAt > a.lastMovementAt ? b : a;
}

/**
 * Derives per-system pilot presence from `forMap` rows. Rows without a joined
 * location contribute nothing (a forged row names a document it cannot read);
 * rows whose owner feed did not cover the character (`feedFreshAt` null /
 * missing) stay off the map even when last-known location remains; duplicate
 * character ids collapse to their freshest evidence; output order is
 * deterministic (pilots sorted by character id) so renders and probes see a
 * stable shape for identical inputs.
 */
export function derivePresence(input: PresenceInput): ReadonlyMap<number, SystemPresence> {
  const own = new Set(input.ownCharacterIds);
  const byCharacter = new Map<number, { systemId: number; pilot: PresencePilot }>();

  for (const row of input.tracked) {
    if (row.location === null) continue;
    const feedFreshAt =
      input.freshness.get(row.userId)?.get(row.characterId) ?? null;
    if (feedFreshAt === null) continue;
    const pilot: PresencePilot = {
      characterId: row.characterId,
      shipTypeId: row.location.shipTypeId,
      docked: row.location.stationId !== null || row.location.structureId !== null,
      lastMovementAt: row.location.transitionObservedAt ?? row.location.observedAt,
      state: presenceState(
        feedFreshAt,
        row.location.observedAt,
        input.now,
      ),
      ownAfk: input.ownAfk && own.has(row.characterId),
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
 * Indexes the freshness payload by owner then character id. An unloaded
 * payload yields an empty index, which reads as stale-everywhere — the honest
 * verdict while the freshness subscription is still cold.
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
  ownAfk: boolean,
): ReadonlyMap<number, SystemPresence> {
  return derivePresence({
    tracked: payload?.tracked ?? [],
    freshness: feedFreshnessIndex(freshness),
    now,
    ownCharacterIds: payload?.ownTrackedCharacterIds ?? [],
    ownAfk,
  });
}

/**
 * The one status word a pilot row displays. Precedence is operator-directed
 * (plan): `Stale` first (the feed is not talking — nothing else is
 * trustworthy), then `AFK` (own local gate), then `Docked`, then `In space`.
 */
export function presenceStatusWord(pilot: PresencePilot): PresenceStatusWord {
  if (pilot.state === 'stale') return 'Stale';
  if (pilot.ownAfk) return 'AFK';
  if (pilot.docked) return 'Docked';
  return 'In space';
}

/**
 * Frame-badge tone: green while anyone in the system is live, neutral once
 * every pilot's feed has gone stale (visibly provisional, contract DC-3).
 */
export function presenceBadgeTone(presence: SystemPresence): 'green' | 'neutral' {
  return presence.pilots.some((pilot) => pilot.state === 'live') ? 'green' : 'neutral';
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
