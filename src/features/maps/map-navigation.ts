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
