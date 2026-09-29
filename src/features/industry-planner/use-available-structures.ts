'use client';

import { useState } from 'react';
import { apiFetch } from '@/transport/api-client';
import { availableStructuresEndpoint } from './api-contract';
import type { AvailableStructure } from './types';
import { useResourceRead } from './use-resource-read';

/** The account's custom and shared corporation structures, read once per mount. */
export async function readAvailableStructures(signal: AbortSignal): Promise<AvailableStructure[] | null> {
  const res = await apiFetch(availableStructuresEndpoint, { cache: 'no-store', signal });
  return res.ok ? res.data.structures : null;
}

/** Null until the first read lands. */
export function useAvailableStructures(): AvailableStructure[] | null {
  const [structures, setStructures] = useState<AvailableStructure[] | null>(null);
  useResourceRead(readAvailableStructures, { enabled: true, onData: setStructures });
  return structures;
}
