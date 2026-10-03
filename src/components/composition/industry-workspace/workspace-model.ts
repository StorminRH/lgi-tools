import type { IndustryJob } from '@/features/industry-jobs/esi-projection';
import type { JobCategory } from '@/features/industry-jobs/industry-jobs-styles';
import { countUsedSlots, type SlotCapacity, slotCapacity } from '@/features/industry-jobs/slots';
import type { IndustryProfileRow } from '@/features/industry-planner/profiles/api-contract';
import { type CategoryKey, categoryName } from '@/features/industry-planner/profiles/production-categories';
import type { ProfileDocument } from '@/features/industry-planner/profiles/profile-document';
import { type AppliedTimeSkill, skillTimeBreakdown } from '@/features/industry-planner/skill-time';
import { type BoardView, OVERVIEW } from '../board/board-view-model';

export const SLOT_POOLS: readonly JobCategory[] = ['manufacturing', 'reactions', 'science'];

// ---------------------------------------------------------------------------
// Selection: the URL names the profile and the member; the remembered profile
// fills in when the URL does not. A profile id that no longer exists is
// reported so the page can say so instead of quietly showing another one.
// Without a member, or with one that is not on the profile, the workspace
// shows the whole profile.

export interface WorkspaceSelection {
  profile: IndustryProfileRow | null;
  missingProfileId: string | null;
}

export function resolveSelection(
  profiles: readonly IndustryProfileRow[],
  requested: string | null,
  remembered: string | null,
): WorkspaceSelection {
  const byId = (id: string | null) => profiles.find((p) => p.id === id) ?? null;
  const profile = byId(requested) ?? byId(remembered) ?? profiles[0] ?? null;
  return { profile, missingProfileId: requested !== null && byId(requested) === null ? requested : null };
}

export function memberView(param: string | null, doc: ProfileDocument | null): BoardView {
  if (doc === null || param === null || !/^\d+$/.test(param)) return OVERVIEW;
  const characterId = Number(param);
  return doc.members.some((m) => m.characterId === characterId) ? { view: 'character', characterId } : OVERVIEW;
}

/** The address with another profile open and no member focused. */
export function profileHref(pathname: string, search: string, profileId: string | null): string {
  const params = new URLSearchParams(search);
  if (profileId === null) params.delete('profile');
  else params.set('profile', profileId);
  params.delete('character');
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
  categories: CategoryKey[];
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
      categories: member.categories,
    };
  });
}

/** What a member builds, in one line. */
export function roleLine(member: Pick<RailMember, 'categories'>): string {
  return member.categories.length === 0 ? 'Nothing assigned' : member.categories.map(categoryName).join(' · ');
}

export function addableCharacters(
  doc: ProfileDocument,
  roster: readonly RosterCharacter[],
): RosterCharacter[] {
  const members = new Set(doc.members.map((m) => m.characterId));
  return roster.filter((c) => !members.has(c.characterId));
}

// ---------------------------------------------------------------------------
// Capacity: one character is one set of slots however many categories it
// covers. Unknown stays unknown: a character without synced skills has no
// known capacity, and one without a readable job feed has no known usage.

export interface MemberCapacity {
  characterId: number;
  capacity: SlotCapacity | null;
  used: Record<JobCategory, number> | null;
}

export interface CapacitySources {
  levelsByCharacter: ReadonlyMap<number, Record<string, number> | null>;
  /** Null while personal jobs load or after they fail. */
  personalJobs: ReadonlyMap<number, { data: { jobs: IndustryJob[] } | null }> | null;
  corpJobs: readonly IndustryJob[];
}

export function memberCapacity(characterId: number, sources: CapacitySources): MemberCapacity {
  const levels = sources.levelsByCharacter.get(characterId) ?? null;
  const board = sources.personalJobs?.get(characterId)?.data ?? null;
  return {
    characterId,
    capacity: levels === null ? null : slotCapacity(levels),
    used: board === null ? null : countUsedSlots(characterId, board.jobs, sources.corpJobs),
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

export function poolSummaries(
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

/**
 * Used over capacity when usage is known; capacity alone otherwise. "+" marks
 * capacity still syncing, and "?" a pool no one's skills have synced for yet.
 */
export function poolFigure(pool: PoolSummary): string {
  const unknownAll = pool.unknownCapacity > 0 && pool.capacity === 0;
  const capacity = unknownAll ? '?' : pool.unknownCapacity > 0 ? `${pool.capacity}+` : String(pool.capacity);
  return pool.unknownUsed > 0 || unknownAll ? capacity : `${pool.used}/${capacity}`;
}

// ---------------------------------------------------------------------------
// A character's own production skills: general job-time skills and the
// skills behind each slot pool. Product-specific skills are not shown here
// because which ones apply depends on the product.

export interface MemberSkills {
  manufacturing: { skills: AppliedTimeSkill[]; totalPct: number };
  reactions: { skills: AppliedTimeSkill[]; totalPct: number };
}

export function memberSkills(levels: Record<string, number> | null): MemberSkills | null {
  if (levels === null) return null;
  const breakdown = skillTimeBreakdown({ levels, nodeTimeSkills: {} });
  return { manufacturing: breakdown.manufacturing, reactions: breakdown.reaction };
}
