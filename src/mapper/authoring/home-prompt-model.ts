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

/**
 * Derives the current-system control from this map's tracking opt-in and feed
 * coverage. A last-known location without a live covered sample is offline —
 * not a current system. Loading subscriptions keep the control inert.
 */
export function homeCurrentSystem(input: {
  readonly characterId: number | null;
  readonly tracking: HomePromptTracking | undefined;
  readonly freshness: HomePromptFreshness | undefined;
}): HomeCurrentSystem {
  if (input.characterId == null || input.tracking === undefined || input.freshness === undefined) {
    return { kind: 'loading' };
  }
  if (!input.tracking.ownTrackedCharacterIds.includes(input.characterId)) {
    return { kind: 'untracked' };
  }
  const feedFreshAt =
    input.freshness.fresh.find((row) => row.characterId === input.characterId)
      ?.feedFreshAt ?? null;
  if (feedFreshAt === null) return { kind: 'offline' };
  const location = input.tracking.tracked.find(
    (row) => row.characterId === input.characterId,
  )?.location;
  if (location == null) return { kind: 'offline' };
  return { kind: 'ready', systemId: location.solarSystemId };
}
