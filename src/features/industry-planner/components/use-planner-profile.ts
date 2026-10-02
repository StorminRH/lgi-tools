'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePreference } from '@/components/PreferencesProvider';
import { useSystemSearch } from '@/components/use-system-search';
import { industryProfile } from '@/lib/preferences';
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
import type { SelectedLocation, SelectedReactionSystem } from './planner-contexts';

export interface PlannerProfileState {
  profiles: IndustryProfileRow[] | null;
  /** The profile the planner builds with: the one last used, or the first. */
  profile: IndustryProfileRow | null;
  setProfileId: (id: string) => void;
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
  // The planner and the Profiles tab share the profile last used.
  const [profileId, setProfileId] = usePreference(industryProfile);
  const profile = profiles?.find((p) => p.id === profileId) ?? profiles?.[0] ?? null;
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

/** The location state a profile drives so the product's own job prices where it runs. */
export interface LocationWriters {
  location: SelectedLocation | null;
  setLocation: (location: SelectedLocation | null) => void;
  applyBuildSystem: (
    sys: { systemId: number; systemName: string; security: number | null },
    opts: { persist: boolean },
  ) => Promise<unknown>;
  setSelectedStructure: (structure: AvailableStructure | null) => void;
  setReactionSystem: (system: SelectedReactionSystem | null) => void;
  setReactionStructure: (structure: AvailableStructure | null) => void;
}

/**
 * The product's own job sets where the build is priced: its facility's
 * system gives the job cost index, and its structure the facility tax. Jobs
 * deeper in the tree take their bonuses from their own facilities. With no
 * facility to go by, the build prices at baseline.
 */
function useProfileLocation(
  plan: ProfilePlan | null,
  activityId: number,
  writers: LocationWriters,
): void {
  const { systems } = useSystemSearch();
  const facility = plan?.top.facility ?? null;
  const found = systems.find((s) => s.id === facility?.systemId);
  const system = useMemo(
    () => (found ? { systemId: found.id, systemName: found.name, security: found.security } : null),
    [found],
  );
  const { location, setLocation, applyBuildSystem, setSelectedStructure, setReactionSystem, setReactionStructure } =
    writers;
  const current = location?.systemId ?? null;
  const structure = facility?.structure ?? null;
  useEffect(() => {
    if (activityId === REACTION_ACTIVITY) {
      setReactionSystem(system);
      setReactionStructure(structure);
      return;
    }
    setSelectedStructure(structure);
    if (system === null) {
      if (current !== null) setLocation(null);
      return;
    }
    if (current !== system.systemId) void applyBuildSystem(system, { persist: false });
  }, [
    system,
    structure,
    current,
    activityId,
    applyBuildSystem,
    setLocation,
    setSelectedStructure,
    setReactionSystem,
    setReactionStructure,
  ]);
}

/**
 * The planner under its chosen profile: the profile, its per-job plan, and
 * the factors the build uses. Without a profile the build is baseline.
 */
export function useProfileFactors(
  structure: BlueprintStructure,
  location: LocationWriters & {
    availableStructures: AvailableStructure[] | null;
    structureFactors: StructureFactors;
  },
): PlannerProfileState & { structureFactors: StructureFactors; skillTimeFactors: SkillTimeFactors | null } {
  const profile = usePlannerProfile(structure, location.availableStructures);
  useProfileLocation(profile.plan, structure.activityId, location);
  return {
    ...profile,
    structureFactors: profile.plan?.structureFactors ?? location.structureFactors,
    skillTimeFactors: profile.plan?.skillTimeFactors ?? null,
  };
}
