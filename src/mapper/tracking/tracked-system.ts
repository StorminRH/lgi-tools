/**
 * Account-level live-system target from the caller's tracked pilots.
 * `loading` is the truthful warm-up state while tracking subscriptions have
 * not delivered — never reported as `none`. `ambiguous` is two+ tracked
 * pilots in different last-known systems (paste and window policies consume
 * this independently).
 */
export type TrackedSystemTarget =
  | { readonly kind: 'ready'; readonly systemId: number }
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ambiguous' };

/**
 * Resolves the unique last-known system from the account's tracked pilots on
 * this map. A missing location does not unlock a target; two different
 * last-known systems stay ambiguous.
 */
export function trackedSystemTarget(input: {
  readonly ownTrackedCharacterIds: readonly number[];
  readonly tracked: readonly {
    readonly characterId: number;
    readonly location: { readonly solarSystemId: number } | null;
  }[];
}): TrackedSystemTarget {
  const own = new Set(input.ownTrackedCharacterIds);
  const systems = new Set<number>();
  for (const row of input.tracked) {
    if (!own.has(row.characterId) || row.location === null) continue;
    systems.add(row.location.solarSystemId);
  }
  if (systems.size === 0) return { kind: 'none' };
  if (systems.size > 1) return { kind: 'ambiguous' };
  const systemId = systems.values().next().value;
  if (systemId === undefined) return { kind: 'none' };
  return { kind: 'ready', systemId };
}
