'use client';

import { useEffect, useState } from 'react';
import { createClientStore, useClientStore } from '@/lib/client-store';
import { apiFetch } from '@/transport/api-client';
import { availableStructuresEndpoint } from './api-contract';
import type { AvailableStructure } from './types';
import { createResourceRead } from './resource-read';

const structuresRevision = createClientStore(0);

export function refreshAvailableStructures(): void {
  structuresRevision.set(structuresRevision.get() + 1);
}

/** The account's custom and shared corporation structures. */
export async function readAvailableStructures(signal: AbortSignal): Promise<AvailableStructure[] | null> {
  const res = await apiFetch(availableStructuresEndpoint, { cache: 'no-store', signal });
  return res.ok ? res.data.structures : null;
}

/** Null until the first read lands. */
export function useAvailableStructures(): AvailableStructure[] | null {
  const [structures, setStructures] = useState<AvailableStructure[] | null>(null);
  const revision = useClientStore(structuresRevision);
  useEffect(() => {
    const resource = createResourceRead({ read: readAvailableStructures, onData: setStructures });
    void resource.start();
    return resource.cancel;
  }, [revision]);
  return structures;
}
