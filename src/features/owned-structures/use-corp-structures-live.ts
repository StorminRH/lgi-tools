'use client';

import { type LiveDatasetState, useLiveDataset } from '@/components/use-live-dataset';
import { createClientStore, useClientStore } from '@/lib/client-store';
import { corpStructuresEndpoint } from './api-contract';
import type { CorpStructurePageView } from './types';

// A rig save bumps the revision, and every reader's loop starts over on it.
const structuresRevision = createClientStore(0);

export function refreshCorpStructures(): void {
  structuresRevision.set(structuresRevision.get() + 1);
}

/**
 * The member corps and their structures behind the structures drawer and the
 * corporation settings page. The server render hands over its first draw,
 * which stands until the live read lands and the newer data streams in.
 */
export function useCorpStructuresLive(
  initial: readonly CorpStructurePageView[],
): { corporations: readonly CorpStructurePageView[] } & Pick<LiveDatasetState, 'failed' | 'retry'> {
  const revision = useClientStore(structuresRevision);
  const { response, failed, retry } = useLiveDataset(corpStructuresEndpoint, revision);
  return { corporations: response?.corporations ?? initial, failed, retry };
}
