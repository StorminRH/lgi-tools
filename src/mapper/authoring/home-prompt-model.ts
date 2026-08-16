/** Tracking overlay the home prompt reads from `mapTracking.forMap`. */
export interface HomePromptTracking {
  readonly ownTrackedCharacterIds: readonly number[];
  readonly tracked: readonly {
    readonly characterId: number;
    readonly location: { readonly solarSystemId: number } | null;
  }[];
}

/** What the home prompt's current-system control should do. */
export type HomeCurrentSystem =
  | { readonly kind: 'loading' }
  | { readonly kind: 'untracked' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'ready'; readonly systemId: number };

function lastKnownSystemId(
  characterId: number,
  tracking: HomePromptTracking,
): number | null {
  if (!tracking.ownTrackedCharacterIds.includes(characterId)) return null;
  return tracking.tracked.find((row) => row.characterId === characterId)
    ?.location?.solarSystemId ?? null;
}

/**
 * Derives the current-system control from this map's tracking opt-in and
 * last-known location. Loading subscriptions keep the control inert. The
 * session character wins when it has a last-known system; otherwise a unique
 * tracked last-known location on this map is a current-system seed (an
 * in-space alt is usable when the session character has no pin). Two+
 * last-known systems without a session-character pin stay offline so create
 * does not guess a root; paste and persistent windows refuse that case as
 * ambiguous on their own policy.
 */
export function homeCurrentSystem(input: {
  readonly characterId: number | null;
  readonly tracking: HomePromptTracking | undefined;
}): HomeCurrentSystem {
  if (input.characterId == null || input.tracking === undefined) {
    return { kind: 'loading' };
  }
  if (input.tracking.ownTrackedCharacterIds.length === 0) {
    return { kind: 'untracked' };
  }
  const preferred = lastKnownSystemId(input.characterId, input.tracking);
  if (preferred !== null) return { kind: 'ready', systemId: preferred };
  const systems = new Set<number>();
  for (const characterId of input.tracking.ownTrackedCharacterIds) {
    const systemId = lastKnownSystemId(characterId, input.tracking);
    if (systemId !== null) systems.add(systemId);
  }
  if (systems.size !== 1) return { kind: 'offline' };
  const systemId = systems.values().next().value;
  if (systemId === undefined) return { kind: 'offline' };
  return { kind: 'ready', systemId };
}
