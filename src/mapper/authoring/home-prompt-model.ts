export interface HomePromptTracking {
  readonly ownTrackedCharacterIds: readonly number[];
  readonly tracked: readonly {
    readonly characterId: number;
    readonly location: { readonly solarSystemId: number } | null;
  }[];
}

export interface HomePromptCoverage {
  readonly coverage: readonly {
    readonly characterId: number;
    readonly covered: boolean;
  }[];
}

/** What the home prompt's current-system control should do. */
export type HomeCurrentSystem =
  | { readonly kind: 'loading' }
  | { readonly kind: 'untracked' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'ready'; readonly systemId: number };

function liveSystemId(
  characterId: number,
  tracking: HomePromptTracking,
  coverage: HomePromptCoverage,
): number | null {
  if (!tracking.ownTrackedCharacterIds.includes(characterId)) return null;
  const covered =
    coverage.coverage.find((row) => row.characterId === characterId)?.covered
    ?? false;
  if (!covered) return null;
  return tracking.tracked.find((row) => row.characterId === characterId)
    ?.location?.solarSystemId ?? null;
}

/**
 * Derives the current-system control from this map's tracking opt-in and
 * present+online coverage. A last-known location without a covered sample
 * is offline — not a current system. Loading subscriptions keep the
 * control inert. The session character wins when it is live; otherwise a
 * unique tracked live location on this map is a current-system seed.
 */
export function homeCurrentSystem(input: {
  readonly characterId: number | null;
  readonly tracking: HomePromptTracking | undefined;
  readonly coverage: HomePromptCoverage | undefined;
}): HomeCurrentSystem {
  if (
    input.characterId == null
    || input.tracking === undefined
    || input.coverage === undefined
  ) {
    return { kind: 'loading' };
  }
  if (input.tracking.ownTrackedCharacterIds.length === 0) {
    return { kind: 'untracked' };
  }
  const preferred = liveSystemId(
    input.characterId,
    input.tracking,
    input.coverage,
  );
  if (preferred !== null) return { kind: 'ready', systemId: preferred };
  const systems = new Set<number>();
  for (const characterId of input.tracking.ownTrackedCharacterIds) {
    const systemId = liveSystemId(characterId, input.tracking, input.coverage);
    if (systemId !== null) systems.add(systemId);
  }
  if (systems.size !== 1) return { kind: 'offline' };
  const systemId = systems.values().next().value;
  if (systemId === undefined) return { kind: 'offline' };
  return { kind: 'ready', systemId };
}
