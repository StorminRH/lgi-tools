import type { SecurityClass } from '@/data/eve-data/security';
import type { IndustryJob } from '@/features/industry-jobs/esi-projection';
import type { JobCategory } from '@/features/industry-jobs/industry-jobs-styles';
import { countUsedSlots, SLOT_SKILLS, type SlotCapacity, slotCapacity } from '@/features/industry-jobs/slots';
import type { IndustryProfileRow } from '@/features/industry-planner/profiles/api-contract';
import {
  type FacilityRef,
  type ProfileDocument,
  type ProfileMember,
  RESPONSIBILITIES,
  type Responsibility,
} from '@/features/industry-planner/profiles/profile-document';
import {
  type MissingFacility,
  profileReferenceIssues,
  resolveResponsibility,
  type ResponsibilityResolution,
} from '@/features/industry-planner/profiles/responsibilities';
import { type AppliedTimeSkill, skillTimeBreakdown } from '@/features/industry-planner/skill-time';
import {
  computeStructureBonus,
  type IndustryActivityId,
  MANUFACTURING_ACTIVITY,
  REACTION_ACTIVITY,
  type StructureBonus,
} from '@/features/industry-planner/structure-bonus';
import { hostsReactions } from '@/features/industry-planner/structure-factors';
import { parseFacilityValue } from '@/features/industry-planner/facility-value';
import type { AvailableStructure } from '@/features/industry-planner/types';

export const SLOT_POOLS: readonly JobCategory[] = ['manufacturing', 'reactions', 'science'];

// ---------------------------------------------------------------------------
// Selection: the URL names the profile and character; the remembered profile
// fills in when the URL does not. A profile id that no longer exists is
// reported so the page can say so instead of quietly showing another one.

export interface WorkspaceSelection {
  profile: IndustryProfileRow | null;
  missingProfileId: string | null;
  characterId: number | null;
}

function characterIn(doc: ProfileDocument, raw: string | null): number | null {
  const wanted = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
  const member = doc.members.find((m) => m.characterId === wanted) ?? doc.members[0];
  return member?.characterId ?? null;
}

export function resolveSelection(
  profiles: readonly IndustryProfileRow[],
  params: { profile: string | null; character: string | null },
  remembered: string | null,
): WorkspaceSelection {
  const byId = (id: string | null) => profiles.find((p) => p.id === id) ?? null;
  const profile = byId(params.profile) ?? byId(remembered) ?? profiles[0] ?? null;
  const missingProfileId =
    params.profile !== null && byId(params.profile) === null ? params.profile : null;
  return {
    profile,
    missingProfileId,
    characterId: profile === null ? null : characterIn(profile.document, params.character),
  };
}

export function workspaceHref(
  pathname: string,
  search: string,
  next: { profile: string | null; character: number | null },
): string {
  const params = new URLSearchParams(search);
  if (next.profile === null) params.delete('profile');
  else params.set('profile', next.profile);
  if (next.character === null) params.delete('character');
  else params.set('character', String(next.character));
  const query = params.toString();
  return query === '' ? pathname : `${pathname}?${query}`;
}

// ---------------------------------------------------------------------------
// Rail: members in profile order with their linked portrait, and the linked
// characters not yet on the profile.

export interface RosterCharacter {
  characterId: number;
  name: string;
  portraitUrl: string;
}

export interface RailMember {
  characterId: number;
  name: string;
  portraitUrl: string | null;
  linked: boolean;
  roles: Responsibility[];
}

export function railMembers(doc: ProfileDocument, roster: readonly RosterCharacter[]): RailMember[] {
  const byId = new Map(roster.map((c) => [c.characterId, c]));
  return doc.members.map((member) => {
    const linked = byId.get(member.characterId);
    return {
      characterId: member.characterId,
      name: linked?.name ?? member.name,
      portraitUrl: linked?.portraitUrl ?? null,
      linked: linked !== undefined,
      roles: RESPONSIBILITIES.filter((r) =>
        doc.rules.some((rule) => rule.characterId === member.characterId && rule.responsibility === r),
      ),
    };
  });
}

export function addableCharacters(
  doc: ProfileDocument,
  roster: readonly RosterCharacter[],
): RosterCharacter[] {
  const members = new Set(doc.members.map((m) => m.characterId));
  return roster.filter((c) => !members.has(c.characterId));
}

// ---------------------------------------------------------------------------
// Capacity: one character is one set of slots however many responsibilities
// it holds. Unknown stays unknown: a character without synced skills has no
// known capacity, and one without a readable job feed has no known usage.

export interface MemberCapacity {
  characterId: number;
  capacity: SlotCapacity | null;
  used: Record<JobCategory, number> | null;
  jobsAsOf: number | null;
}

export interface CapacitySources {
  levelsByCharacter: ReadonlyMap<number, Record<string, number> | null>;
  /** Null while personal jobs load or after they fail. */
  personalJobs: ReadonlyMap<
    number,
    { data: { jobs: IndustryJob[] } | null; lastRefreshedAt: number | null }
  > | null;
  corpJobs: readonly IndustryJob[];
}

export function memberCapacity(characterId: number, sources: CapacitySources): MemberCapacity {
  const levels = sources.levelsByCharacter.get(characterId) ?? null;
  const personal = sources.personalJobs?.get(characterId);
  const board = personal?.data ?? null;
  return {
    characterId,
    capacity: levels === null ? null : slotCapacity(levels),
    used: board === null ? null : countUsedSlots(characterId, board.jobs, sources.corpJobs),
    jobsAsOf: board === null ? null : (personal?.lastRefreshedAt ?? null),
  };
}

export interface PoolSummary {
  capacity: number;
  used: number;
  /** Characters whose slot count is not known yet. */
  unknownCapacity: number;
  /** Characters whose running jobs are not known yet. */
  unknownUsed: number;
}

/** Free slots, or null when any character's capacity or usage is unknown. */
export function freeSlots(pool: PoolSummary): number | null {
  if (pool.unknownCapacity > 0 || pool.unknownUsed > 0) return null;
  return Math.max(0, pool.capacity - pool.used);
}

function poolSummaries(
  characterIds: Iterable<number>,
  capacities: ReadonlyMap<number, MemberCapacity>,
): Record<JobCategory, PoolSummary> {
  const pools = Object.fromEntries(
    SLOT_POOLS.map((pool) => [pool, { capacity: 0, used: 0, unknownCapacity: 0, unknownUsed: 0 }]),
  ) as Record<JobCategory, PoolSummary>;
  for (const characterId of new Set(characterIds)) {
    const member = capacities.get(characterId);
    for (const pool of SLOT_POOLS) {
      const summary = pools[pool];
      if (member?.capacity) summary.capacity += member.capacity[pool];
      else summary.unknownCapacity += 1;
      if (member?.used) summary.used += member.used[pool];
      else summary.unknownUsed += 1;
    }
  }
  return pools;
}

// ---------------------------------------------------------------------------
// Profile summary: members, responsibility coverage, facilities and slots for
// the selected profile, next to the whole account. A character in two
// profiles is the same slots seen twice, never two pools to add up.

export interface ProfileSummary {
  memberCount: number;
  unlinkedMembers: ProfileMember[];
  coverage: { responsibility: Responsibility; resolution: ResponsibilityResolution }[];
  facilityCount: number;
  missingFacilities: MissingFacility[];
  pools: Record<JobCategory, PoolSummary>;
  account: Record<JobCategory, PoolSummary>;
  skillsPending: number[];
  jobsPending: number[];
  jobsAsOf: number | null;
}

function distinctFacilities(doc: ProfileDocument): number {
  const refs: (FacilityRef | null)[] = [
    ...doc.rules.map((rule) => rule.facility),
    doc.defaults.manufacturingFacility,
    doc.defaults.reactionFacility,
  ];
  return new Set(refs.filter((ref) => ref !== null).map((ref) => ref.id)).size;
}

function oldest(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? null : Math.min(...known);
}

export function profileSummary(args: {
  doc: ProfileDocument;
  linkedIds: ReadonlySet<number>;
  capacities: ReadonlyMap<number, MemberCapacity>;
  availableFacilityIds: ReadonlySet<string> | null;
}): ProfileSummary {
  const { doc, linkedIds, capacities } = args;
  const isLinked = (id: number) => linkedIds.has(id);
  const issues = profileReferenceIssues(doc, isLinked, args.availableFacilityIds);
  const members = doc.members.map((m) => m.characterId).filter(isLinked);
  const memberCapacities = members.map((id) => capacities.get(id));
  return {
    memberCount: doc.members.length,
    unlinkedMembers: issues.unlinkedMembers,
    coverage: RESPONSIBILITIES.map((responsibility) => ({
      responsibility,
      resolution: resolveResponsibility(doc, responsibility, isLinked),
    })),
    facilityCount: distinctFacilities(doc),
    missingFacilities: issues.missingFacilities,
    pools: poolSummaries(members, capacities),
    account: poolSummaries(linkedIds, capacities),
    skillsPending: members.filter((id) => !capacities.get(id)?.capacity),
    jobsPending: members.filter((id) => !capacities.get(id)?.used),
    jobsAsOf: oldest(memberCapacities.map((c) => c?.jobsAsOf ?? null)),
  };
}

// ---------------------------------------------------------------------------
// A character's own production skills: general job-time skills and the
// skills behind each slot pool. Product-specific skills are not shown here
// because which ones apply depends on the product.

export interface MemberSkills {
  manufacturing: { skills: AppliedTimeSkill[]; totalPct: number };
  reactions: { skills: AppliedTimeSkill[]; totalPct: number };
  slots: Record<JobCategory, { capacity: number; skills: { name: string; level: number }[] }>;
}

export function memberSkills(levels: Record<string, number> | null): MemberSkills | null {
  if (levels === null) return null;
  const breakdown = skillTimeBreakdown({ levels, nodeTimeSkills: {} });
  const capacity = slotCapacity(levels);
  const slots = Object.fromEntries(
    SLOT_POOLS.map((pool) => [
      pool,
      {
        capacity: capacity[pool],
        skills: SLOT_SKILLS[pool].map((skill) => ({
          name: skill.name,
          level: levels[String(skill.id)] ?? 0,
        })),
      },
    ]),
  ) as MemberSkills['slots'];
  return { manufacturing: breakdown.manufacturing, reactions: breakdown.reaction, slots };
}

// ---------------------------------------------------------------------------
// Facility effects, kept apart from the character: the hull's own bonus, what
// the rigs add at the structure's security, and the owner's tax. Rig effects
// scale with security, so without a known security they are not guessed.

export type ResponsibilityActivity = 'manufacturing' | 'reactions';

export function activityOf(responsibility: Responsibility): ResponsibilityActivity {
  return responsibility === 'reactions' ? 'reactions' : 'manufacturing';
}

/**
 * The facility a picker value names: null to clear it, undefined to leave it
 * alone (re-picking the current one, or a structure that has since gone).
 */
export function facilityForValue(
  raw: string,
  current: FacilityRef | null,
  structures: readonly AvailableStructure[] | null,
): FacilityRef | null | undefined {
  const selection = parseFacilityValue(raw);
  if (selection.kind !== 'structure') return null;
  if (selection.id === current?.id) return undefined;
  const structure = structures?.find((s) => s.id === selection.id);
  return structure === undefined ? undefined : { id: structure.id, name: structure.name };
}

export type RigEffect =
  | { kind: 'none' }
  | { kind: 'needs-security' }
  | { kind: 'known'; bonus: StructureBonus };

export interface FacilityEffects {
  hull: StructureBonus;
  rigs: RigEffect;
  security: SecurityClass | null;
  taxPct: number | null;
  /** False when a reaction responsibility points at a structure that cannot run reactions. */
  suitsActivity: boolean;
}

/** The part of a combined reduction the rigs add on top of the hull. */
function rigShare(total: number, hull: number): number {
  return hull >= 100 ? 0 : (1 - (1 - total / 100) / (1 - hull / 100)) * 100;
}

export function facilityEffects(
  structure: AvailableStructure,
  activity: ResponsibilityActivity,
  pinnedSecurity: SecurityClass | null,
): FacilityEffects {
  const activityId: IndustryActivityId = activity === 'reactions' ? REACTION_ACTIVITY : MANUFACTURING_ACTIVITY;
  const security = structure.securityClass ?? pinnedSecurity;
  const input = { structureAttrs: structure.structureAttrs, activityId };
  const hull = computeStructureBonus({ ...input, rigAttrs: [], securityClass: security ?? 'high' });
  const suitsActivity = activity === 'manufacturing' || hostsReactions(structure.groupId);
  const base = { hull, security, taxPct: structure.taxPct, suitsActivity };
  if (structure.rigAttrs.length === 0) return { ...base, rigs: { kind: 'none' } };
  if (security === null) return { ...base, rigs: { kind: 'needs-security' } };
  const total = computeStructureBonus({ ...input, rigAttrs: structure.rigAttrs, securityClass: security });
  return {
    ...base,
    rigs: {
      kind: 'known',
      bonus: {
        me: rigShare(total.me, hull.me),
        te: rigShare(total.te, hull.te),
        costBonus: rigShare(total.costBonus, hull.costBonus),
      },
    },
  };
}
