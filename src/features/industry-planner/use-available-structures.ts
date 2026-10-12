'use client';

import { useLiveDataset } from '@/components/use-live-dataset';
import { createClientStore, useClientStore } from '@/lib/client-store';
import { availableStructuresEndpoint } from './api-contract';
import type { AvailableStructure } from './types';

// A user edit bumps the revision, and every reader's loop starts over on it.
const structuresRevision = createClientStore(0);

export function refreshAvailableStructures(): void {
  structuresRevision.set(structuresRevision.get() + 1);
}

/** The account's custom and shared corporation structures. Null until the first read lands. */
export function useAvailableStructures(): AvailableStructure[] | null {
  const revision = useClientStore(structuresRevision);
  const { response } = useLiveDataset(availableStructuresEndpoint, revision);
  return response?.structures ?? null;
}
