// Pure pilot-presence derivation for the Atlas canvas (4.0.4.2.3 OW2).
//
// Last-known location is kept for collapse retention. Pins and friendlies
// only surface a pilot when the flip-only coverage row says they are
// present and ESI-online. The map document and the location row stay
// untouched; React joins `forMap` to `mapTracking.coverage`.
//
// There is no in-between map state. A shown pilot is online; otherwise they
// are absent. Docked vs In space is location, not presence.

/** The single-word status vocabulary the intelligence body renders. */
export type PresenceStatusWord = 'Docked' | 'In space';

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
  /** Per-owner-character covered flag; missing/false means hidden. */
  readonly coverage: ReadonlyMap<string, ReadonlyMap<number, boolean>>;
}

/** Prefers the most recently moved duplicate of one character. */
function betterPilot(a: PresencePilot, b: PresencePilot): PresencePilot {
  return b.lastMovementAt > a.lastMovementAt ? b : a;
}

/**
 * Derives per-system pilot presence from `forMap` rows. Rows without a joined
 * location contribute nothing; uncovered rows stay off the map even when
 * last-known location remains.
 */
export function derivePresence(input: PresenceInput): ReadonlyMap<number, SystemPresence> {
  const byCharacter = new Map<number, { systemId: number; pilot: PresencePilot }>();

  for (const row of input.tracked) {
    if (row.location === null) continue;
    if (input.coverage.get(row.userId)?.get(row.characterId) !== true) continue;
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

/** The `coverage` payload shape presence consumes (undefined while loading). */
export interface CoveragePayload {
  readonly coverage: readonly {
    userId: string;
    characterId: number;
    covered: boolean;
  }[];
}

/**
 * Indexes the coverage payload by owner then character id. An unloaded
 * payload yields an empty index, which hides everyone — the honest verdict
 * while the coverage subscription is still cold.
 */
export function coverageIndex(
  payload: CoveragePayload | undefined,
): ReadonlyMap<string, ReadonlyMap<number, boolean>> {
  const index = new Map<string, Map<number, boolean>>();
  for (const entry of payload?.coverage ?? []) {
    const byCharacter = index.get(entry.userId) ?? new Map();
    byCharacter.set(entry.characterId, entry.covered);
    index.set(entry.userId, byCharacter);
  }
  return index;
}

/**
 * Presence from possibly-unloaded `forMap` + `coverage` payloads — the
 * provider's memo body, kept pure and tested so the component seam stays
 * branch-free.
 */
export function derivePresenceFromPayload(
  payload: TrackingPayload | undefined,
  coverage: CoveragePayload | undefined,
): ReadonlyMap<number, SystemPresence> {
  return derivePresence({
    tracked: payload?.tracked ?? [],
    coverage: coverageIndex(coverage),
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
