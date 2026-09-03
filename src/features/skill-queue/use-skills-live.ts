'use client';

import { useMemo } from 'react';
import { useLiveDataset } from '@/components/use-live-dataset';
import { anyEligibleCold, eligibleIdsKey } from '@/lib/live-dataset';
import { skillsEndpoint, type SkillsResponse } from './api-contract';

export type ViewerSkills = SkillsResponse['characters'][number];

function skillsIsCold(response: SkillsResponse, eligibleKey: string): boolean {
  return anyEligibleCold(response.characters, eligibleKey);
}

export function useSkillsLive(eligibleCharacterIds: number[]): {
  skillsByCharacter: Map<number, ViewerSkills>;
  names: Record<string, string>;
  now: number;
  loading: boolean;
} {
  const eligibleKey = useMemo(() => eligibleIdsKey(eligibleCharacterIds), [eligibleCharacterIds]);
  const { response, now, loading } = useLiveDataset(skillsEndpoint, eligibleKey, skillsIsCold);
  const skillsByCharacter = useMemo(() => {
    const map = new Map<number, ViewerSkills>();
    for (const character of response?.characters ?? []) map.set(character.characterId, character);
    return map;
  }, [response]);
  return { skillsByCharacter, names: response?.names ?? {}, now, loading };
}
