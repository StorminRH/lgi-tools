import { groupBy } from '@/lib/array';

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
  readonly coverage: ReadonlyMap<number, boolean>;
}

function betterPilot(a: PresencePilot, b: PresencePilot): PresencePilot {
  return b.lastMovementAt > a.lastMovementAt ? b : a;
}

export function derivePresence(input: PresenceInput): ReadonlyMap<number, SystemPresence> {
  const byCharacter = new Map<number, { systemId: number; pilot: PresencePilot }>();

  for (const row of input.tracked) {
    if (row.location === null) continue;
    if (input.coverage.get(row.characterId) !== true) continue;
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

  const pilotsBySystem = groupBy(byCharacter.values(), (held) => held.systemId, (held) => held.pilot);

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
  readonly coverage: readonly { characterId: number; covered: boolean }[];
}

export type CoverageQueryArgs = { mapId: string; characterIds: number[] } | 'skip';

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
    characterIds: [...new Set(tracking.tracked.map((row) => row.characterId))]
      .sort((left, right) => left - right),
  };
}

export function coverageIndex(payload: CoveragePayload | undefined): ReadonlyMap<number, boolean> {
  return new Map((payload?.coverage ?? []).map((entry) => [entry.characterId, entry.covered]));
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
  readonly shipName: string | null;
}

export function friendlyRows(
  pilots: readonly PresencePilot[],
  names: Record<string, string>,
  shipNames: Record<string, string> = {},
): readonly FriendlyRowModel[] {
  return pilots.map((pilot) => ({
    characterId: pilot.characterId,
    label: names[String(pilot.characterId)] ?? String(pilot.characterId),
    word: presenceStatusWord(pilot),
    shipName: pilot.docked || pilot.shipTypeId === null ? null : (shipNames[String(pilot.shipTypeId)] ?? null),
  }));
}
