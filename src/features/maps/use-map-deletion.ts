'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { deleteMap } from './map-lifecycle-client';
import { mapDeletionHref } from './map-navigation';

/**
 * Deletes a map, calls `onDeleted`, then leaves the map's page when it is the
 * one open. Resolves whether the map was deleted.
 */
export function useMapDeletion() {
  const router = useRouter();
  const searchParams = useSearchParams();

  return async function removeMap(mapId: string, onDeleted: () => void): Promise<boolean> {
    const outcome = await deleteMap({ mapId });
    if (!outcome.ok) return false;
    onDeleted();
    const href = mapDeletionHref(searchParams, mapId);
    if (href !== null) router.push(href);
    router.refresh();
    return true;
  };
}
