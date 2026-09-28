import { useEffect, useState } from 'react';
import { loadSystemStatics } from './client';

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
  return result?.systemId === systemId ? result.codes : [];
}
