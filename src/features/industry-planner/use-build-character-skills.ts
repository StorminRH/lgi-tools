'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/transport/api-client';
import { skillLevelsEndpoint } from './api-contract';

const RECONCILE_DELAY_MS = 4_000;

export function useBuildCharacterSkillLevels(
  characterId: number | null,
): Record<string, number> | null {
  const [fetched, setFetched] = useState<{
    characterId: number;
    levels: Record<string, number> | null;
  } | null>(null);

  useEffect(() => {
    if (characterId === null) return;
    let ignore = false;
    let reconcileTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const settle = (levels: Record<string, number> | null, isReconcile: boolean) => {
      setFetched({ characterId, levels });
      if (!isReconcile && levels === null) {
        reconcileTimer = setTimeout(() => load(true), RECONCILE_DELAY_MS);
      }
    };
    const load = (isReconcile: boolean) => {
      apiFetch(skillLevelsEndpoint, {
        body: { characterId },
        cache: 'no-store',
        signal: controller.signal,
      })
        .then((res) => {
          if (ignore) return;
          settle(res.ok ? res.data.levels : null, isReconcile);
        })
        .catch(() => {
          if (ignore) return;
          setFetched({ characterId, levels: null });
        });
    };
    load(false);
    return () => {
      ignore = true;
      controller.abort();
      if (reconcileTimer !== undefined) clearTimeout(reconcileTimer);
    };
  }, [characterId]);

  return fetched !== null && fetched.characterId === characterId ? fetched.levels : null;
}
