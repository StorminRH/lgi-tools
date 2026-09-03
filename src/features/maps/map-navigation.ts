/**
 * Whether the Atlas URL addresses a map. An empty `map=` still counts, matching
 * `URLSearchParams.get('map')` which is `''` rather than `null`.
 */
export function atlasMapQueryPresent(
  map: string | string[] | undefined,
): boolean {
  return map !== undefined;
}

/** Creates a query-preserving history destination for one selected Atlas map. */
export function mapSelectionHref(
  pathname: string,
  searchParams: Pick<URLSearchParams, 'toString'>,
  mapId: string,
): string {
  const next = new URLSearchParams(searchParams.toString());
  next.set('map', mapId);
  return `${pathname}?${next.toString()}`;
}

/**
 * Where an EVE sign-in started from the signed-out Atlas landing returns to.
 * Only the shared map selection survives the round-trip: a stale `?error=` from
 * an earlier attempt, or any other transient query, would otherwise be replayed
 * onto the signed-in catalogue or canvas.
 */
export function atlasSignInReturnHref(
  searchParams: Pick<URLSearchParams, 'get'>,
): string {
  const mapId = searchParams.get('map');
  if (mapId === null || mapId === '') return '/atlas';
  return `/atlas?${new URLSearchParams({ map: mapId }).toString()}`;
}

/**
 * Landing href after deleting the currently selected map, or null when the
 * deleted map is not the URL target and the listing can refresh in place.
 */
export function mapDeletionHref(
  searchParams: Pick<URLSearchParams, 'get' | 'toString'>,
  mapId: string,
): string | null {
  if (searchParams.get('map') !== mapId) return null;
  const next = new URLSearchParams(searchParams.toString());
  next.delete('map');
  const query = next.toString();
  return query === '' ? '/atlas' : `/atlas?${query}`;
}

