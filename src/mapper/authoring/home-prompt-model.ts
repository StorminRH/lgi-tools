/** Tracking overlay the home prompt reads from `mapTracking.forMap`. */
export interface HomePromptTracking {
  readonly ownTrackedCharacterIds: readonly number[];
  readonly tracked: readonly {
    readonly characterId: number;
    readonly location: { readonly solarSystemId: number } | null;
  }[];
}

/** Coverage overlay the home prompt reads from `mapTracking.feedFreshness`. */
export interface HomePromptFreshness {
  readonly fresh: readonly {
    readonly characterId: number;
    readonly feedFreshAt: number | null;
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
  freshness: HomePromptFreshness,
): number | null {
  if (!tracking.ownTrackedCharacterIds.includes(characterId)) return null;
  const feedFreshAt =
    freshness.fresh.find((row) => row.characterId === characterId)?.feedFreshAt
    ?? null;
  if (feedFreshAt === null) return null;
  return tracking.tracked.find((row) => row.characterId === characterId)
    ?.location?.solarSystemId ?? null;
}

/**
 * Derives the current-system control from this map's tracking opt-in and feed
 * coverage. A last-known location without a live covered sample is offline —
 * not a current system. Loading subscriptions keep the control inert. The
 * session character wins when it is live; otherwise any tracked live location
 * on this map is a current system (an in-space alt is usable when the session
 * character is logged off).
 */
export function homeCurrentSystem(input: {
  readonly characterId: number | null;
  readonly tracking: HomePromptTracking | undefined;
  readonly freshness: HomePromptFreshness | undefined;
}): HomeCurrentSystem {
  if (input.characterId == null || input.tracking === undefined || input.freshness === undefined) {
    return { kind: 'loading' };
  }
  if (input.tracking.ownTrackedCharacterIds.length === 0) {
    return { kind: 'untracked' };
  }
  const preferred = liveSystemId(
    input.characterId,
    input.tracking,
    input.freshness,
  );
  if (preferred !== null) return { kind: 'ready', systemId: preferred };
  for (const characterId of input.tracking.ownTrackedCharacterIds) {
    const systemId = liveSystemId(characterId, input.tracking, input.freshness);
    if (systemId !== null) return { kind: 'ready', systemId };
  }
  return { kind: 'offline' };
}
