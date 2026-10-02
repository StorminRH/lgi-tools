import { jobSkillTimeFactor, type NodeTimeSkill, type SkillTimeFactors } from '../skill-time';
import {
  type IndustryActivityId,
  MANUFACTURING_ACTIVITY,
  REACTION_ACTIVITY,
  type StructureBonus,
} from '../structure-bonus';
import { bestOf, hostsReactions, structureCategoryBonus, type StructureFactors } from '../structure-factors';
import type { AvailableStructure } from '../types';
import { type CategoryKey, coveringOwners } from './production-categories';
import { facilityKey, type ProfileDocument } from './profile-document';

/**
 * A build under a production profile: each job goes to the facility and the
 * member that cover its most specific category. Where several cover it, the
 * facility with the best bonus and the member with the fastest skills win.
 * A job no facility covers gets no structure bonus; a job no member covers
 * is open to every member.
 */

export interface PlanFacility {
  key: string;
  /** The saved structure's id, or the NPC station's. */
  id: string;
  name: string;
  kind: 'structure' | 'station';
  /** The account's current copy of a saved structure; null for a station or a structure that has gone. */
  structure: AvailableStructure | null;
  systemId: number | null;
  security: number | null;
  categories: readonly CategoryKey[];
}

export interface PlanMember {
  characterId: number;
  categories: readonly CategoryKey[];
  /** Null while skills load, or for a member that is no longer linked. */
  levels: Record<string, number> | null;
}

export interface JobRoute {
  facility: PlanFacility | null;
  characterId: number | null;
  bonus: StructureBonus | null;
}

export interface ProfilePlan {
  structureFactors: StructureFactors;
  skillTimeFactors: SkillTimeFactors;
  routeOf: (blueprintTypeId: number) => JobRoute;
  top: JobRoute;
}

const NO_BONUS: StructureBonus = { me: 0, te: 0, costBonus: 0 };

function productionActivity(activity: number | undefined): IndustryActivityId | null {
  return activity === MANUFACTURING_ACTIVITY || activity === REACTION_ACTIVITY ? activity : null;
}

function canHost(facility: PlanFacility, activity: IndustryActivityId): boolean {
  if (activity === MANUFACTURING_ACTIVITY) return true;
  return facility.structure !== null && hostsReactions(facility.structure.groupId);
}

function facilityBonus(facility: PlanFacility, activity: IndustryActivityId, filterIds: readonly number[]): StructureBonus {
  if (facility.structure === null) return NO_BONUS;
  return structureCategoryBonus(facility.structure, activity, facility.security, filterIds) ?? NO_BONUS;
}

/** Material first, then time, then job cost. */
const better = (a: StructureBonus, b: StructureBonus) =>
  a.me !== b.me ? a.me > b.me : a.te !== b.te ? a.te > b.te : a.costBonus > b.costBonus;

function bestFacility(
  facilities: readonly PlanFacility[],
  activity: IndustryActivityId,
  filterIds: readonly number[],
): { facility: PlanFacility | null; bonus: StructureBonus | null } {
  const covering = coveringOwners(
    facilities.filter((f) => canHost(f, activity)),
    activity,
    filterIds,
  );
  let best: { facility: PlanFacility | null; bonus: StructureBonus | null } = { facility: null, bonus: null };
  for (const facility of covering) {
    const bonus = facilityBonus(facility, activity, filterIds);
    if (best.bonus === null || better(bonus, best.bonus)) best = { facility, bonus };
  }
  return best;
}

function bestMember(
  members: readonly PlanMember[],
  activity: IndustryActivityId,
  filterIds: readonly number[],
  nodeSkills: readonly NodeTimeSkill[],
): { characterId: number | null; factor: number } {
  const covering = coveringOwners(members, activity, filterIds);
  const candidates = covering.length > 0 ? covering : members;
  let best: { characterId: number; factor: number } | null = null;
  for (const member of candidates) {
    if (member.levels === null) continue;
    const factor = jobSkillTimeFactor(member.levels, activity, nodeSkills);
    if (best === null || factor < best.factor) best = { characterId: member.characterId, factor };
  }
  return best ?? { characterId: candidates[0]?.characterId ?? null, factor: 1 };
}

export function profilePlan(args: {
  facilities: readonly PlanFacility[];
  members: readonly PlanMember[];
  nodeActivityByBlueprint: Record<number, number>;
  nodeFilterIds: Record<number, number[]>;
  nodeTimeSkills: Record<number, NodeTimeSkill[]>;
  topBlueprintTypeId: number;
}): ProfilePlan {
  const { facilities, members, nodeActivityByBlueprint, nodeFilterIds, nodeTimeSkills } = args;
  const routes = new Map<number, JobRoute & { skillFactor: number }>();
  const routeAndFactor = (bp: number) => {
    const known = routes.get(bp);
    if (known) return known;
    const activity = productionActivity(nodeActivityByBlueprint[bp]);
    const filterIds = nodeFilterIds[bp] ?? [];
    const place = activity === null ? { facility: null, bonus: null } : bestFacility(facilities, activity, filterIds);
    const member =
      activity === null
        ? { characterId: null, factor: 1 }
        : bestMember(members, activity, filterIds, nodeTimeSkills[bp] ?? []);
    const route = { ...place, characterId: member.characterId, skillFactor: member.factor };
    routes.set(bp, route);
    return route;
  };
  const routeOf = (bp: number): JobRoute => {
    const { facility, characterId, bonus } = routeAndFactor(bp);
    return { facility, characterId, bonus };
  };
  const readout = (activity: IndustryActivityId) =>
    bestOf(
      Object.entries(nodeActivityByBlueprint).flatMap(([bp, act]) =>
        act === activity ? (routeAndFactor(Number(bp)).bonus ?? []) : [],
      ),
    );
  const manufacturingBonus = readout(MANUFACTURING_ACTIVITY);
  const reactionBonus = readout(REACTION_ACTIVITY);
  const top = routeOf(args.topBlueprintTypeId);
  return {
    structureFactors: {
      structureMeFactorOf: (bp) => 1 - (routeAndFactor(bp).bonus?.me ?? 0) / 100,
      structureTeFactorOf: (bp) => 1 - (routeAndFactor(bp).bonus?.te ?? 0) / 100,
      structureCostBonusPct: top.bonus?.costBonus ?? 0,
      manufacturingBonus,
      reactionBonus,
      active: manufacturingBonus !== null || reactionBonus !== null,
    },
    skillTimeFactors: {
      skillTimeFactorOf: (bp) => routeAndFactor(bp).skillFactor,
      active: members.some((m) => m.levels !== null),
    },
    routeOf,
    top,
  };
}

/**
 * The profile's facilities as the plan reads them. A saved structure takes
 * its current system from the account's copy; a station keeps the system it
 * was added with.
 */
export function planFacilities(
  doc: Pick<ProfileDocument, 'facilities'>,
  structures: readonly AvailableStructure[] | null,
  securityOf: (systemId: number) => number | null,
): PlanFacility[] {
  return doc.facilities.map((facility) => {
    const structure = facility.kind === 'structure' ? (structures?.find((s) => s.id === facility.id) ?? null) : null;
    const systemId = structure?.systemId ?? facility.systemId;
    return {
      key: facilityKey(facility),
      id: facility.id,
      name: structure?.name ?? facility.name,
      kind: facility.kind,
      structure,
      systemId,
      security: systemId === null ? null : securityOf(systemId),
      categories: facility.categories,
    };
  });
}

export function planMembers(
  doc: Pick<ProfileDocument, 'members'>,
  levelsByCharacter: ReadonlyMap<number, Record<string, number> | null>,
): PlanMember[] {
  return doc.members.map((m) => ({
    characterId: m.characterId,
    categories: m.categories,
    levels: levelsByCharacter.get(m.characterId) ?? null,
  }));
}

export interface PlanSummary {
  facilities: { facility: PlanFacility; jobs: number }[];
  members: { characterId: number; jobs: number }[];
  /** Jobs no facility covers: they run with no structure bonus. */
  uncovered: number;
}

/** How many of the build's jobs each facility and member takes. */
export function planSummary(plan: ProfilePlan, jobBlueprintTypeIds: readonly number[]): PlanSummary {
  const facilities = new Map<string, { facility: PlanFacility; jobs: number }>();
  const members = new Map<number, number>();
  let uncovered = 0;
  for (const bp of new Set(jobBlueprintTypeIds)) {
    const { facility, characterId } = plan.routeOf(bp);
    if (facility === null) uncovered += 1;
    else facilities.set(facility.key, { facility, jobs: (facilities.get(facility.key)?.jobs ?? 0) + 1 });
    if (characterId !== null) members.set(characterId, (members.get(characterId) ?? 0) + 1);
  }
  return {
    facilities: [...facilities.values()],
    members: [...members].map(([characterId, jobs]) => ({ characterId, jobs })),
    uncovered,
  };
}
