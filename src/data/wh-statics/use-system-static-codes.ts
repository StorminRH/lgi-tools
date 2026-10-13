import { useEffect, useState } from 'react';
import { loadSystemStatics } from './client';

/** One empty list while loading or without a system, so memos keyed on the codes hold. */
const NO_STATIC_CODES: readonly string[] = [];

export function useSystemStaticCodes(systemId: number): readonly string[] {
  const [result, setResult] = useState<{ systemId: number; codes: readonly string[] } | null>(null);
  useEffect(() => {
    if (systemId <= 0) return;
    let alive = true;
    void loadSystemStatics(systemId).then(
      (codes) => { if (alive) setResult({ systemId, codes }); },
      () => {},
    );
    return () => { alive = false; };
  }, [systemId]);
  return result?.systemId === systemId ? result.codes : NO_STATIC_CODES;
}
