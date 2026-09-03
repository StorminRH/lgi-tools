import type { IndustryJob, JobStatus } from './esi-projection';
import { type JobCategory, jobCategory } from './industry-jobs-styles';

const MASS_PRODUCTION_SKILL_ID = 3387;

const ADVANCED_MASS_PRODUCTION_SKILL_ID = 24625;

const LABORATORY_OPERATION_SKILL_ID = 3406;

const ADVANCED_LABORATORY_OPERATION_SKILL_ID = 24624;

const MASS_REACTIONS_SKILL_ID = 45748;

const ADVANCED_MASS_REACTIONS_SKILL_ID = 45749;

const SLOT_CATEGORIES: readonly JobCategory[] = ['manufacturing', 'science', 'reactions'];

export interface SlotCapacity {
  manufacturing: number;
  science: number;
  reactions: number;
}

export function slotCapacity(levels: Record<string, number> | null): SlotCapacity {
  const rank = (skillId: number) => levels?.[String(skillId)] ?? 0;
  return {
    manufacturing:
      1 + rank(MASS_PRODUCTION_SKILL_ID) + rank(ADVANCED_MASS_PRODUCTION_SKILL_ID),
    science:
      1 + rank(LABORATORY_OPERATION_SKILL_ID) + rank(ADVANCED_LABORATORY_OPERATION_SKILL_ID),
    reactions: 1 + rank(MASS_REACTIONS_SKILL_ID) + rank(ADVANCED_MASS_REACTIONS_SKILL_ID),
  };
}

export function jobOccupiesSlot(status: JobStatus): boolean {
  return status === 'active' || status === 'paused' || status === 'ready';
}

/**
 * A character's used slots: their personal board unioned with the corp jobs
 * they installed, DEDUPED by job_id — whether ESI's personal feed also lists a
 * character's corp-installed jobs is not established, so the union must never
 * double-count. Corp jobs without an installer_id (legacy docs — the field is
 * optional in the stored shape) can't be attributed and are skipped.
 */
export function countUsedSlots(
  characterId: number,
  personalJobs: readonly IndustryJob[],
  corpJobs: readonly IndustryJob[],
): Record<JobCategory, number> {
  const used: Record<JobCategory, number> = { manufacturing: 0, science: 0, reactions: 0 };
  const seen = new Set<number>();
  const mine = corpJobs.filter((job) => job.installer_id === characterId);
  for (const job of [...personalJobs, ...mine]) {
    if (seen.has(job.job_id)) continue;
    seen.add(job.job_id);
    if (!jobOccupiesSlot(job.status)) continue;
    const category = jobCategory(job.activity_id);
    if (category !== null) used[category] += 1;
  }
  return used;
}

export interface SlotUsage {
  used: number;
  total: number;
}

export type SlotMetaModel = Record<JobCategory, SlotUsage>;

export function slotMetaTotals(args: {
  loading: boolean;
  eligibleCharacterIds: readonly number[];
  characters: ReadonlyArray<{ characterId: number; slots: SlotCapacity }>;
  personalJobsByCharacter: ReadonlyMap<number, { data: { jobs: IndustryJob[] } | null }>;
  corpJobs: readonly IndustryJob[];
}): SlotMetaModel | null {
  const eligible = new Set(args.eligibleCharacterIds);
  const corpInstallers = new Set<number>();
  for (const job of args.corpJobs) {
    if (job.installer_id !== undefined && jobOccupiesSlot(job.status)) {
      corpInstallers.add(job.installer_id);
    }
  }
  const characters = args.characters.filter(
    (character) =>
      eligible.has(character.characterId) || corpInstallers.has(character.characterId),
  );
  if (args.loading || characters.length === 0) return null;
  const model: SlotMetaModel = {
    manufacturing: { used: 0, total: 0 },
    science: { used: 0, total: 0 },
    reactions: { used: 0, total: 0 },
  };
  for (const character of characters) {
    const personal =
      args.personalJobsByCharacter.get(character.characterId)?.data?.jobs ?? [];
    const used = countUsedSlots(character.characterId, personal, args.corpJobs);
    for (const category of SLOT_CATEGORIES) {
      model[category].used += used[category];
      model[category].total += character.slots[category];
    }
  }
  return model;
}
