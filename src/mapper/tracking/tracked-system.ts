export type TrackedSystemTarget =
  | {
      readonly kind: 'ready';
      readonly systemId: number;
      readonly characterId: number;
    }
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' };

/** One of the caller's own tracked characters on this map. */
export interface DockCharacter {
  readonly characterId: number;
  /** Null while the character is offline or has no known location. */
  readonly systemId: number | null;
  readonly lastMovementAt: number | null;
}

export type DockCharacterMode = 'auto' | 'pinned';

export interface DockCharacterResolution {
  readonly target: TrackedSystemTarget;
  readonly mode: DockCharacterMode;
  /** The pinned character, when it is tracked on this map. */
  readonly pinnedCharacterId: number | null;
  /** Sorted by character id so the menu order is stable. */
  readonly characters: readonly DockCharacter[];
}

export function dockCharacters(input: {
  readonly ownTrackedCharacterIds: readonly number[];
  readonly tracked: readonly {
    readonly characterId: number;
    readonly location: {
      readonly solarSystemId: number;
      readonly transitionObservedAt: number | null;
      readonly observedAt: number;
    } | null;
  }[];
  readonly coverage: ReadonlyMap<number, boolean>;
}): readonly DockCharacter[] {
  const own = new Set(input.ownTrackedCharacterIds);
  const byId = new Map<number, DockCharacter>();
  for (const characterId of own) {
    byId.set(characterId, { characterId, systemId: null, lastMovementAt: null });
  }
  for (const row of input.tracked) {
    if (!own.has(row.characterId) || row.location === null) continue;
    if (input.coverage.get(row.characterId) !== true) continue;
    byId.set(row.characterId, {
      characterId: row.characterId,
      systemId: row.location.solarSystemId,
      lastMovementAt: row.location.transitionObservedAt ?? row.location.observedAt,
    });
  }
  return [...byId.values()].sort((left, right) => left.characterId - right.characterId);
}

function readyTarget(character: DockCharacter): TrackedSystemTarget {
  return character.systemId === null
    ? { kind: 'none' }
    : { kind: 'ready', systemId: character.systemId, characterId: character.characterId };
}

/** Auto follows whichever online character moved most recently. */
function latestMover(characters: readonly DockCharacter[]): DockCharacter | null {
  let latest: DockCharacter | null = null;
  for (const character of characters) {
    if (character.systemId === null || character.lastMovementAt === null) continue;
    if (latest === null || character.lastMovementAt > (latest.lastMovementAt ?? 0)) {
      latest = character;
    }
  }
  return latest;
}

/**
 * Picks the character whose system the dock, scanner, and paste target use.
 * A pinned character holds the dock while it is online; when it is offline or
 * not tracked on this map the dock follows Auto instead.
 */
export function resolveDockCharacter(
  characters: readonly DockCharacter[],
  pinnedCharacterId: number | null,
): DockCharacterResolution {
  const pinned = characters.find((character) => character.characterId === pinnedCharacterId);
  if (pinned !== undefined && pinned.systemId !== null) {
    return {
      target: readyTarget(pinned),
      mode: 'pinned',
      pinnedCharacterId: pinned.characterId,
      characters,
    };
  }
  const latest = latestMover(characters);
  return {
    target: latest === null ? { kind: 'none' } : readyTarget(latest),
    mode: 'auto',
    pinnedCharacterId: pinned?.characterId ?? null,
    characters,
  };
}

/** The radio value for Auto; character ids are always positive. */
export const DOCK_AUTO_VALUE = 0;

export function dockCharacterLabel(
  resolution: Pick<DockCharacterResolution, 'target' | 'mode'>,
  nameOf: (characterId: number) => string,
): string {
  const shown = resolution.target.kind === 'ready'
    ? nameOf(resolution.target.characterId)
    : null;
  if (resolution.mode === 'pinned' && shown !== null) return shown;
  return shown === null ? 'Auto' : `Auto (${shown})`;
}

export type PasteTarget =
  | TrackedSystemTarget
  | {
      readonly kind: 'choose';
      /** Online characters the user picks the scanning character from. */
      readonly candidates: readonly DockCharacter[];
    };

/**
 * Picks the system scanner output is pasted into. The default scanner wins
 * while it is online; otherwise a paste is unambiguous only when every online
 * character shares one system, and the user is asked to choose.
 */
export function resolvePasteTarget(
  characters: readonly DockCharacter[] | null,
  scannerCharacterId: number | null,
): PasteTarget {
  if (characters === null) return { kind: 'loading' };
  const online = characters.filter((character) => character.systemId !== null);
  const scanner = online.find((character) => character.characterId === scannerCharacterId);
  if (scanner !== undefined) return readyTarget(scanner);
  const [first] = online;
  if (first === undefined) return { kind: 'none' };
  if (online.every((character) => character.systemId === first.systemId)) {
    return readyTarget(first);
  }
  return { kind: 'choose', candidates: online };
}
