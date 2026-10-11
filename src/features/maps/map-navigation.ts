import { firstSearchParam, withSearchParams } from '@/lib/search-params';

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
  return withSearchParams(pathname, searchParams, { map: mapId });
}

export function atlasMapHref(
  map: string | string[] | undefined,
): string {
  const mapId = firstSearchParam(map);
  if (mapId === undefined || mapId === '') return '/atlas';
  return `/atlas?${new URLSearchParams({ map: mapId }).toString()}`;
}

export function mapDeletionHref(
  searchParams: Pick<URLSearchParams, 'get' | 'toString'>,
  mapId: string,
): string | null {
  if (searchParams.get('map') !== mapId) return null;
  return withSearchParams('/atlas', searchParams, { map: null });
}
