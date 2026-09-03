export type PresenceStatusWord = 'Docked' | 'In space';

export interface TrackedLocationSnapshot {
  readonly solarSystemId: number;
  readonly stationId: number | null;
  readonly structureId: number | null;
  readonly shipTypeId: number | null;
  readonly transitionObservedAt: number | null;
  readonly observedAt: number;
}

export interface TrackedPresenceRow {
  readonly userId: string;
  readonly characterId: number;
  readonly location: TrackedLocationSnapshot | null;
}

export interface PresencePilot {
  readonly characterId: number;
  readonly shipTypeId: number | null;
  readonly docked: boolean;
  readonly lastMovementAt: number;
}

export interface SystemPresence {
  readonly pilots: readonly PresencePilot[];
}

export interface PresenceInput {
  readonly tracked: readonly TrackedPresenceRow[];
  readonly coverage: ReadonlyMap<string, ReadonlyMap<number, boolean>>;
}

function betterPilot(a: PresencePilot, b: PresencePilot): PresencePilot {
  return b.lastMovementAt > a.lastMovementAt ? b : a;
}

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

export interface TrackingPayload {
  readonly tracked: readonly TrackedPresenceRow[];
  readonly ownTrackedCharacterIds: readonly number[];
}

export interface CoveragePayload {
  readonly coverage: readonly {
    userId: string;
    characterId: number;
    covered: boolean;
  }[];
}

export type CoverageQueryArgs =
  | {
      mapId: string;
      identities: { userId: string; characterId: number }[];
    }
  | 'skip';

export function holdDefined<T>(
  previous: T | undefined,
  next: T | undefined,
): T | undefined {
  return next !== undefined ? next : previous;
}

export function coverageQueryArgs(
  mapId: string,
  tracking: TrackingPayload | undefined,
): CoverageQueryArgs {
  if (tracking === undefined) return 'skip';
  return {
    mapId,
    identities: tracking.tracked
      .map((row) => ({ userId: row.userId, characterId: row.characterId }))
      .sort(
        (left, right) =>
          left.userId.localeCompare(right.userId)
          || left.characterId - right.characterId,
      ),
  };
}

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

export function derivePresenceFromPayload(
  payload: TrackingPayload | undefined,
  coverage: CoveragePayload | undefined,
): ReadonlyMap<number, SystemPresence> {
  return derivePresence({
    tracked: payload?.tracked ?? [],
    coverage: coverageIndex(coverage),
  });
}

export function presenceStatusWord(pilot: PresencePilot): PresenceStatusWord {
  return pilot.docked ? 'Docked' : 'In space';
}

export interface FriendlyRowModel {
  readonly characterId: number;
  readonly label: string;
  readonly word: PresenceStatusWord;
}

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
