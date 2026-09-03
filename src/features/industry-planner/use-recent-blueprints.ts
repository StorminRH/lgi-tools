'use client';

import { useEffect, useState } from 'react';
import { readRecentBlueprints, type RecentBlueprint } from './recent-blueprints';

export function useRecentBlueprints(): RecentBlueprint[] | null {
  const [recent, setRecent] = useState<RecentBlueprint[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setRecent(readRecentBlueprints()), 0);
    return () => clearTimeout(t);
  }, []);

  return recent;
}
