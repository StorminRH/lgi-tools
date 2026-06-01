'use client';

import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { readRecentBlueprints, type RecentBlueprint } from '../recent-blueprints';
import { BlueprintRow } from './BlueprintRow';

// Reads the localStorage "recently viewed" list after mount and renders it as
// dashboard rows. `null` means "not read yet" (the server render + first paint),
// so the static shell never reads the client store; an empty array means "read,
// nothing there". The read is deferred a tick via setTimeout(0) — the same
// lint-safe escape the cascade clock uses — so it stays clear of
// react-hooks/set-state-in-effect.
export function RecentlyViewed() {
  const [recent, setRecent] = useState<RecentBlueprint[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setRecent(readRecentBlueprints()), 0);
    return () => clearTimeout(t);
  }, []);

  if (recent === null || recent.length === 0) {
    return (
      <EmptyState>
        {recent === null
          ? ' '
          : 'No blueprints viewed yet — search above and open one to start your history.'}
      </EmptyState>
    );
  }

  return (
    <>
      {recent.map((r) => (
        <BlueprintRow
          key={r.typeId}
          typeId={r.productTypeId}
          name={r.name}
          href={`/industry/${r.typeId}`}
        />
      ))}
    </>
  );
}
