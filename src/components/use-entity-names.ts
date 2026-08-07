'use client';

// Client-side EVE entity-id → name resolution through /api/eve/names, shared
// by every surface that renders ids the SDE cannot name (corp jobs board
// installers/corps, Atlas pilot presence). Extracted from CorpJobsBoard when
// the mapper became the second consumer.
import { useEffect, useState } from 'react';
import { ENTITY_NAMES_MAX_IDS, entityNamesEndpoint } from '@/data/eve-data/api-contract';
import { apiFetch } from '@/transport/api-client';

/**
 * Resolves entity ids to names, re-fetching only when the id SET changes
 * (keyed on sorted content, so caller-side array churn is free). Bounded by
 * the endpoint's id cap; an id that cannot be resolved is simply absent and
 * callers fall back to their own generic label.
 */
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
