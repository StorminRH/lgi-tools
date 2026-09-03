export type TrackedSystemTarget =
  | { readonly kind: 'ready'; readonly systemId: number }
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ambiguous' };

export function trackedSystemTarget(input: {
  readonly ownTrackedCharacterIds: readonly number[];
  readonly tracked: readonly {
    readonly userId: string;
    readonly characterId: number;
    readonly location: { readonly solarSystemId: number } | null;
  }[];
  readonly coverage: ReadonlyMap<string, ReadonlyMap<number, boolean>>;
}): TrackedSystemTarget {
  const own = new Set(input.ownTrackedCharacterIds);
  const systems = new Set<number>();
  for (const row of input.tracked) {
    if (!own.has(row.characterId) || row.location === null) continue;
    if (input.coverage.get(row.userId)?.get(row.characterId) !== true) continue;
    systems.add(row.location.solarSystemId);
  }
  if (systems.size === 0) return { kind: 'none' };
  if (systems.size > 1) return { kind: 'ambiguous' };
  const systemId = systems.values().next().value;
  if (systemId === undefined) return { kind: 'none' };
  return { kind: 'ready', systemId };
}
