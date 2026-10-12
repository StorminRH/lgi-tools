'use client';

import { type LiveDatasetState, useLiveDataset } from '@/components/use-live-dataset';
import { type IndustrySlotsResponse, industrySlotsEndpoint, type ViewerSlots } from './api-contract';

const NO_SLOTS: ViewerSlots[] = [];

/** Cold while a character has no synced skills yet: its slots are unknown, not zero. */
function slotsIsCold(response: IndustrySlotsResponse): boolean {
  return response.characters.some((character) => !character.synced);
}

export function useSlotsLive(): { characters: ViewerSlots[] } & Pick<LiveDatasetState, 'loading' | 'failed' | 'retry'> {
  const { response, loading, failed, retry } = useLiveDataset(industrySlotsEndpoint, true, slotsIsCold);
  return { characters: response?.characters ?? NO_SLOTS, loading, failed, retry };
}
