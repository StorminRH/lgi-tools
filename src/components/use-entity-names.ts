'use client';

import { useEffect, useState } from 'react';
import { ENTITY_NAMES_MAX_IDS, entityNamesEndpoint } from '@/data/eve-data/api-contract';
import { apiFetch } from '@/transport/api-client';

export function useEntityNames(entityIds: readonly number[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const idsKey = [...new Set(entityIds)]
    .sort((left, right) => left - right)
    .slice(0, ENTITY_NAMES_MAX_IDS)
    .join(',');

  useEffect(() => {
    if (idsKey === '') return;
    let cancelled = false;
    void apiFetch(entityNamesEndpoint, {
      body: { ids: idsKey.split(',').map(Number) },
    }).then((result) => {
      if (!cancelled && result.ok) {
        setNames((prev) => ({ ...prev, ...result.data.names }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return names;
}
