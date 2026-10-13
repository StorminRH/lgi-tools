'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { deleteMap, mapLifecycleFailureMessage } from './map-lifecycle-client';
import { mapDeletionHref } from './map-navigation';

/**
 * Deletes a map, calls `onDeleted`, then leaves the map's page when it is the
 * one open. `removeMap` resolves whether the map was deleted; `error` holds
 * why the last delete failed.
 */
export function useMapDeletion() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  async function removeMap(mapId: string, onDeleted: () => void): Promise<boolean> {
    const outcome = await deleteMap({ mapId });
    if (!outcome.ok) {
      setError(mapLifecycleFailureMessage('delete', outcome));
      return false;
    }
    setError(null);
    onDeleted();
    const href = mapDeletionHref(searchParams, mapId);
    if (href !== null) router.push(href);
    router.refresh();
    return true;
  }

  return { removeMap, error };
}
