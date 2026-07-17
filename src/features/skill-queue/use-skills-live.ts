'use client';

// The client data hook for the skill-queue surfaces (MIGRATE.B.1; on the shared
// live-tracker platform since 3.7.30.1). It plugs the skills endpoint into the generic
// useLiveDataset shell (fetch-on-view → one reconcile → render-clock tick) and builds the
// per-character map. Unlike jobs, skills carries no server-side status to re-derive — the
// home roster and /skills panel derive the live queue progress/completion client-side
// from each entry's absolute finish_date (progress.ts); this hook only surfaces the
// payload and the render clock.
import { useMemo } from 'react';
import { useLiveDataset } from '@/components/use-live-dataset';
import { anyEligibleCold, eligibleIdsKey } from '@/lib/live-dataset';
import { skillsEndpoint, type SkillsResponse } from './api-contract';

type ViewerSkills = SkillsResponse['characters'][number];

// Module-level cold predicate (stable identity for the shell's effect dep): any
// scope-eligible character still un-synced (data:null) means the write-behind hasn't
// populated Neon yet, so one reconcile re-fetch is due.
function skillsIsCold(response: SkillsResponse, eligibleKey: string): boolean {
  return anyEligibleCold(response.characters, eligibleKey);
}

/**
 * Encapsulates the skills live subscription and state lifecycle; callers provide lookup keys where
 * required and render the returned state.
 */
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
