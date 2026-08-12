'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { deleteMap, mapLifecycleFailureMessage } from './map-lifecycle-client';
import { mapDeletionHref } from './map-navigation';

/**
 * Runs the reversible map-delete write and retargets the Atlas URL when the
 * deleted map was the current selection.
 */
export function useMapDeletion() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeMap(mapId: string, onDeleted: () => void) {
    setDeleting(true);
    setError(null);
    const outcome = await deleteMap({ mapId });
    setDeleting(false);
    if (!outcome.ok) {
      setError(mapLifecycleFailureMessage('delete'));
      return;
    }
    onDeleted();
    const href = mapDeletionHref(searchParams, mapId);
    if (href === null) {
      router.refresh();
      return;
    }
    // SearchParams-only push reuses the map layout snapshot; refresh re-fetches
    // the catalogue and trash after the current map leaves the URL.
    router.push(href);
    router.refresh();
  }

  return { deleting, error, removeMap };
}
