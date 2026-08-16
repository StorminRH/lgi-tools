import { feedIsPresent } from '../tracking/presence-model';

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
  now: number,
): number | null {
  if (!tracking.ownTrackedCharacterIds.includes(characterId)) return null;
  const feedFreshAt =
    freshness.fresh.find((row) => row.characterId === characterId)?.feedFreshAt
    ?? null;
  if (!feedIsPresent(feedFreshAt, now)) return null;
  return tracking.tracked.find((row) => row.characterId === characterId)
    ?.location?.solarSystemId ?? null;
}

/**
 * Derives the current-system control from this map's tracking opt-in and
 * present+online coverage. A last-known location without a live covered
 * sample is offline — not a current system. Loading subscriptions keep the
 * control inert. The session character wins when it is live; otherwise a
 * unique tracked live location on this map is a current-system seed.
 */
export function homeCurrentSystem(input: {
  readonly characterId: number | null;
  readonly tracking: HomePromptTracking | undefined;
  readonly freshness: HomePromptFreshness | undefined;
  readonly now: number;
}): HomeCurrentSystem {
  if (
    input.characterId == null
    || input.tracking === undefined
    || input.freshness === undefined
  ) {
    return { kind: 'loading' };
  }
  if (input.tracking.ownTrackedCharacterIds.length === 0) {
    return { kind: 'untracked' };
  }
  const preferred = liveSystemId(
    input.characterId,
    input.tracking,
    input.freshness,
    input.now,
  );
  if (preferred !== null) return { kind: 'ready', systemId: preferred };
  const systems = new Set<number>();
  for (const characterId of input.tracking.ownTrackedCharacterIds) {
    const systemId = liveSystemId(
      characterId,
      input.tracking,
      input.freshness,
      input.now,
    );
    if (systemId !== null) systems.add(systemId);
  }
  if (systems.size !== 1) return { kind: 'offline' };
  const systemId = systems.values().next().value;
  if (systemId === undefined) return { kind: 'offline' };
  return { kind: 'ready', systemId };
}
