'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_ASSUMPTIONS, type ResearchAssumptions } from './research-insight';
import { readAssumptions, writeAssumptions } from './research-assumptions';

/** The research assumptions, kept per browser; defaults until storage is read after hydration. */
export function useResearchAssumptions(): {
  assumptions: ResearchAssumptions;
  update: (patch: Partial<ResearchAssumptions>) => void;
} {
  const [assumptions, setAssumptions] = useState<ResearchAssumptions>(DEFAULT_ASSUMPTIONS);

  useEffect(() => {
    const t = setTimeout(() => setAssumptions(readAssumptions()), 0);
    return () => clearTimeout(t);
  }, []);

  const update = useCallback((patch: Partial<ResearchAssumptions>) => {
    setAssumptions((current) => {
      const next = { ...current, ...patch };
      writeAssumptions(next);
      return next;
    });
  }, []);

  return { assumptions, update };
}
