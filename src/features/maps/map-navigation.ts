export function atlasMapQueryPresent(
  map: string | string[] | undefined,
): boolean {
  return map !== undefined;
}

export function mapSelectionHref(
  pathname: string,
  searchParams: Pick<URLSearchParams, 'toString'>,
  mapId: string,
): string {
  const next = new URLSearchParams(searchParams.toString());
  next.set('map', mapId);
  return `${pathname}?${next.toString()}`;
}

export function atlasSignInReturnHref(
  searchParams: Pick<URLSearchParams, 'get'>,
): string {
  const mapId = searchParams.get('map');
  if (mapId === null || mapId === '') return '/atlas';
  return `/atlas?${new URLSearchParams({ map: mapId }).toString()}`;
}

export function atlasSignInReturnHrefFromMapQuery(
  map: string | string[] | undefined,
): string {
  const params = new URLSearchParams();
  const value = Array.isArray(map) ? map[0] : map;
  if (value !== undefined) params.set('map', value);
  return atlasSignInReturnHref(params);
}

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
