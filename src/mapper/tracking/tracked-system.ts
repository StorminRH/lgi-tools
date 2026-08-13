/**
 * Account-level live-system target from the caller's online tracked pilots.
 * `loading` is the truthful warm-up state while tracking subscriptions have
 * not delivered — never reported as `none`. `ambiguous` is two+ covered
 * pilots in different systems (paste and window policies consume this
 * independently).
 */
export type TrackedSystemTarget =
  | { readonly kind: 'ready'; readonly systemId: number }
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ambiguous' };

/**
 * Resolves the unique covered system from the account's online tracked
 * pilots on this map. Coverage (`feedFreshAt` non-null) is the online gate —
 * last-known location alone must not unlock a live-system target.
 */
export function trackedSystemTarget(input: {
  readonly ownTrackedCharacterIds: readonly number[];
  readonly tracked: readonly {
    readonly userId: string;
    readonly characterId: number;
    readonly location: { readonly solarSystemId: number } | null;
  }[];
  /** Per-owner-character quantized feed freshness; null/missing = not covered. */
  readonly freshness: ReadonlyMap<string, ReadonlyMap<number, number | null>>;
}): TrackedSystemTarget {
  const own = new Set(input.ownTrackedCharacterIds);
  const systems = new Set<number>();
  for (const row of input.tracked) {
    if (!own.has(row.characterId) || row.location === null) continue;
    const feedFreshAt =
      input.freshness.get(row.userId)?.get(row.characterId) ?? null;
    if (feedFreshAt === null) continue;
    systems.add(row.location.solarSystemId);
  }
  if (systems.size === 0) return { kind: 'none' };
  if (systems.size > 1) return { kind: 'ambiguous' };
  const systemId = systems.values().next().value;
  if (systemId === undefined) return { kind: 'none' };
  return { kind: 'ready', systemId };
}
