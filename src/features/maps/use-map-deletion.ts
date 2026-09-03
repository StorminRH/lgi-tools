'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { deleteMap, mapLifecycleFailureMessage } from './map-lifecycle-client';
import { mapDeletionHref } from './map-navigation';

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

    router.push(href);
    router.refresh();
  }

  return { deleting, error, removeMap };
}
