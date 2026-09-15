'use client';

import { useEffect, useState } from 'react';
import { loadTypeNames } from './type-names-client';

export function useTypeNames(
  typeIds: readonly number[],
): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const idsKey = [...new Set(typeIds)]
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((left, right) => left - right)
    .join(',');

  useEffect(() => {
    if (idsKey === '') return;
    let cancelled = false;
    void loadTypeNames(idsKey.split(',').map(Number)).then(
      (resolved) => {
        if (!cancelled) {
          setNames((prev) => ({ ...prev, ...resolved }));
        }
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return names;
}
