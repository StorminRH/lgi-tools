'use client';

import { useEffect, useState } from 'react';
import { loadTypeNames } from './type-names-client';

const TYPE_NAMES_RETRY_MS = 15_000;

export function useTypeNames(
  typeIds: readonly number[],
): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const idsKey = [...new Set(typeIds)]
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((left, right) => left - right)
    .join(',');

  useEffect(() => {
    if (idsKey === '') return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    void loadTypeNames(idsKey.split(',').map(Number)).then(
      (resolved) => {
        if (!cancelled) {
          setNames((prev) => ({ ...prev, ...resolved }));
        }
      },
      () => {
        if (!cancelled) {
          retry = setTimeout(() => setAttempt((value) => value + 1), TYPE_NAMES_RETRY_MS);
        }
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [idsKey, attempt]);

  return names;
}
