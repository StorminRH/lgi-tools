'use client';

import { useEffect } from 'react';
import { createRememberedRead, useRememberedRead } from '@/components/remembered-read';
import { createClientStore, useClientStore } from '@/lib/client-store';
import { apiFetch } from '@/transport/api-client';
import { availableStructuresEndpoint } from './api-contract';
import type { AvailableStructure } from './types';
import { createResourceRead } from './resource-read';
import { useReadIdentity } from '@/platform/auth/read-identity';

const structuresRevision = createClientStore(0);
// The last list outlives the pages that read it, so a page mounting again draws it at once.
const structuresMemory = createRememberedRead<AvailableStructure[]>();

export function refreshAvailableStructures(): void {
  structuresRevision.set(structuresRevision.get() + 1);
}

/** The account's custom and shared corporation structures. */
async function readAvailableStructures(signal: AbortSignal): Promise<AvailableStructure[] | null> {
  const res = await apiFetch(availableStructuresEndpoint, { cache: 'no-store', signal });
  return res.ok ? res.data.structures : null;
}

/** Null until the first read lands. */
export function useAvailableStructures(): AvailableStructure[] | null {
  const structures = useRememberedRead(structuresMemory);
  const identity = useReadIdentity();
  const revision = useClientStore(structuresRevision);
  useEffect(() => {
    if (identity === null) return;
    const resource = createResourceRead({
      read: readAvailableStructures,
      onData: (next) => structuresMemory.set(next, identity),
    });
    void resource.start();
    return resource.cancel;
  }, [revision, identity]);
  return structures;
}
