import { useEffect, useState } from 'react';
import { parseIdsKey } from '@/lib/array';
import type { createNamesClient } from './names-client';

export function useNames(ids: readonly number[], client: ReturnType<typeof createNamesClient>): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const key = client.normalize(ids).join(',');
  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    void client.load(parseIdsKey(key)).then(
      (resolved) => {
        if (!cancelled) setNames((previous) => ({ ...previous, ...resolved }));
      },
      () => {
        if (!cancelled && client.retryMs !== undefined) {
          retry = setTimeout(() => setAttempt((value) => value + 1), client.retryMs);
        }
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [key, attempt, client]);
  return names;
}
