'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePreference } from '@/components/PreferencesProvider';
import { useSystemSearch } from '@/components/use-system-search';
import { plannerProfile } from '@/lib/preferences';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { apiFetch } from '@/transport/api-client';
import { teamSkillLevelsEndpoint } from '../api-contract';
import type { IndustryProfileRow } from '../profiles/api-contract';
import { planFacilities, planMembers, profilePlan, type ProfilePlan } from '../profiles/profile-plan';
import { useIndustryProfiles } from '../profiles/use-industry-profiles';
import type { SkillTimeFactors } from '../skill-time';
import { REACTION_ACTIVITY } from '../structure-bonus';
import type { StructureFactors } from '../structure-factors';
import type { AvailableStructure, BlueprintStructure } from '../types';
import { useResourceRead } from '../use-resource-read';
import type { BuildSetupValue } from './planner-contexts';

export interface PlannerProfileState {
  profiles: IndustryProfileRow[] | null;
  /** The profile the planner builds with, once the list confirms it still exists. */
  profile: IndustryProfileRow | null;
  setProfileId: (id: string | null) => void;
  plan: ProfilePlan | null;
}

type LevelsByCharacter = ReadonlyMap<number, Record<string, number> | null>;

async function readTeamSkillLevels(signal: AbortSignal): Promise<LevelsByCharacter | null> {
  const res = await apiFetch(teamSkillLevelsEndpoint, { cache: 'no-store', signal });
  return res.ok ? new Map(res.data.characters.map((c) => [c.characterId, c.levels])) : null;
}

const NO_LEVELS: LevelsByCharacter = new Map();

/**
 * The production profile applied to this build: each job's facility from the
 * profile, at that facility's security, and each job's character skills.
 */
function usePlannerProfile(
  structure: BlueprintStructure,
  availableStructures: AvailableStructure[] | null,
): PlannerProfileState {
  const { session } = useAuth();
  const { profiles } = useIndustryProfiles(session !== null);
  const [profileId, setProfileId] = usePreference(plannerProfile);
  const profile = profiles?.find((p) => p.id === profileId) ?? null;
  const [levels, setLevels] = useState<LevelsByCharacter>(NO_LEVELS);
  useResourceRead(readTeamSkillLevels, { enabled: profile !== null, onData: setLevels });
  const { systems } = useSystemSearch();
  const securityOf = useCallback(
    (systemId: number) => systems.find((s) => s.id === systemId)?.security ?? null,
    [systems],
  );
  const doc = profile?.document ?? null;
  const plan = useMemo(
    () =>
      doc === null
        ? null
        : profilePlan({
            facilities: planFacilities(doc, availableStructures, securityOf),
            members: planMembers(doc, levels),
            nodeActivityByBlueprint: structure.nodeActivityByBlueprint,
            nodeFilterIds: structure.nodeFilterIds,
            nodeTimeSkills: structure.nodeTimeSkills,
            topBlueprintTypeId: structure.blueprintTypeId,
          }),
    [doc, availableStructures, securityOf, levels, structure],
  );
  return { profiles, profile, setProfileId, plan };
}

/**
 * The product's own job sets where the build is priced: its facility's
 * system gives the job cost index, and its structure the facility tax. Jobs
 * deeper in the tree take their bonuses from their own facilities.
 */
function useProfileLocation(
  plan: ProfilePlan | null,
  activityId: number,
  writers: Pick<
    BuildSetupValue,
    'location' | 'applyBuildSystem' | 'setSelectedStructure' | 'setStation' | 'setReactionSystem' | 'setReactionStructure'
  >,
): void {
  const { systems } = useSystemSearch();
  const facility = plan?.top.facility ?? null;
  const system = systems.find((s) => s.id === facility?.systemId) ?? null;
  const { location, applyBuildSystem, setSelectedStructure, setStation, setReactionSystem, setReactionStructure } =
    writers;
  const current = location?.systemId ?? null;
  const structure = facility?.structure ?? null;
  const stationId = facility?.kind === 'station' ? Number(facility.id) : null;
  const stationName = facility?.name ?? null;
  useEffect(() => {
    if (system === null) return;
    const ref = { systemId: system.id, systemName: system.name, security: system.security };
    if (activityId === REACTION_ACTIVITY) {
      setReactionSystem(ref);
      setReactionStructure(structure);
      return;
    }
    setSelectedStructure(structure);
    if (current === system.id) {
      setStation(stationId, stationName);
      return;
    }
    let cancelled = false;
    void applyBuildSystem(ref, { persist: false }).then((outcome) => {
      if (!cancelled && outcome.status === 'applied') setStation(stationId, stationName);
    });
    return () => { cancelled = true; };
  }, [
    system,
    structure,
    stationId,
    stationName,
    current,
    activityId,
    applyBuildSystem,
    setSelectedStructure,
    setStation,
    setReactionSystem,
    setReactionStructure,
  ]);
}

/**
 * The planner under its chosen profile: the profile, its per-job plan, and
 * the factors the build uses. Without a profile the picked structures and
 * the build character apply as before.
 */
export function useProfileFactors(
  structure: BlueprintStructure,
  location: Pick<
    BuildSetupValue,
    | 'location'
    | 'availableStructures'
    | 'applyBuildSystem'
    | 'setSelectedStructure'
    | 'setStation'
    | 'setReactionSystem'
    | 'setReactionStructure'
    | 'structureFactors'
  >,
): PlannerProfileState & { structureFactors: StructureFactors; skillTimeFactors: SkillTimeFactors | null } {
  const profile = usePlannerProfile(structure, location.availableStructures);
  useProfileLocation(profile.plan, structure.activityId, location);
  return {
    ...profile,
    structureFactors: profile.plan?.structureFactors ?? location.structureFactors,
    skillTimeFactors: profile.plan?.skillTimeFactors ?? null,
  };
}
