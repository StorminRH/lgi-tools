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
  map: string | string[] | undefined,
): string {
  const mapId = Array.isArray(map) ? map[0] : map;
  if (mapId === undefined || mapId === '') return '/atlas';
  return `/atlas?${new URLSearchParams({ map: mapId }).toString()}`;
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
