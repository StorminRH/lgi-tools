'use client';

import { useMemo } from 'react';
import { type LiveDatasetState, useLiveDataset } from '@/components/use-live-dataset';
import { idsKey } from '@/lib/array';
import { anyEligibleCold } from '@/lib/live-dataset';
import { type IndustrySlotsResponse, industrySlotsEndpoint, type ViewerSlots } from './api-contract';

// Kept stable, so a memo over the characters holds until slots arrive.
const NO_SLOTS: ViewerSlots[] = [];

// Cold while a pilot whose skills can sync has none synced yet: its slots are
// unknown, not zero. A pilot without the skill scopes never syncs, so it is
// never waited on.
function slotsIsCold(response: IndustrySlotsResponse, eligibleKey: string): boolean {
  return anyEligibleCold(
    response.characters.map((character) => ({
      characterId: character.characterId,
      data: character.synced ? character : null,
    })),
    eligibleKey,
  );
}

/** Slot capacity and skill levels for every linked character, checked back while a refresh runs or a skill-eligible pilot is unsynced. */
export function useSlotsLive(
  eligibleCharacterIds: number[],
): { characters: ViewerSlots[] } & Pick<LiveDatasetState, 'loading' | 'failed' | 'retry'> {
  const eligibleKey = useMemo(() => idsKey(eligibleCharacterIds), [eligibleCharacterIds]);
  const { response, loading, failed, retry } = useLiveDataset(industrySlotsEndpoint, eligibleKey, slotsIsCold);
  return { characters: response?.characters ?? NO_SLOTS, loading, failed, retry };
}
