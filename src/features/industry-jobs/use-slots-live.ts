'use client';

import { useMemo } from 'react';
import { type LiveDatasetState, useLiveDataset } from '@/components/use-live-dataset';
import { idsKey } from '@/lib/array';
import { anyEligibleCold, RECONCILE_BACKOFF } from '@/lib/live-dataset';
import { industrySlotsEndpoint, type IndustrySlotsResponse, type ViewerSlots } from './api-contract';

// Kept stable, so a memo over the characters holds until slots arrive.
const NO_SLOTS: ViewerSlots[] = [];

// Only a pilot whose skills can sync is worth waiting for: one without the
// skill scopes stays unsynced, and every read schedules another refresh.
function slotsIsCold(response: IndustrySlotsResponse, eligibleKey: string): boolean {
  return anyEligibleCold(
    response.characters.map((character) => ({ characterId: character.characterId, data: character.levels })),
    eligibleKey,
  );
}

/** Slot capacity and skill levels for every linked character, reconciled while a skill-eligible pilot has none yet. */
export function useSlotsLive(
  eligibleCharacterIds: number[],
): { characters: ViewerSlots[] } & Pick<LiveDatasetState, 'loading' | 'failed' | 'retry'> {
  const eligibleKey = useMemo(() => idsKey(eligibleCharacterIds), [eligibleCharacterIds]);
  const { response, loading, failed, retry } = useLiveDataset(
    industrySlotsEndpoint,
    eligibleKey,
    slotsIsCold,
    RECONCILE_BACKOFF,
  );
  return { characters: response?.characters ?? NO_SLOTS, loading, failed, retry };
}
