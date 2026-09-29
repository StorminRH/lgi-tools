import type { IndustryJob, JobStatus } from './esi-projection';
import { type JobCategory, jobCategory } from './industry-jobs-styles';

/** The skills that add job slots, one extra slot per trained level. */
export const SLOT_SKILLS: Readonly<Record<JobCategory, readonly { id: number; name: string }[]>> = {
  manufacturing: [
    { id: 3387, name: 'Mass Production' },
    { id: 24625, name: 'Advanced Mass Production' },
  ],
  science: [
    { id: 3406, name: 'Laboratory Operation' },
    { id: 24624, name: 'Advanced Laboratory Operation' },
  ],
  reactions: [
    { id: 45748, name: 'Mass Reactions' },
    { id: 45749, name: 'Advanced Mass Reactions' },
  ],
};

const SLOT_CATEGORIES: readonly JobCategory[] = ['manufacturing', 'science', 'reactions'];

export interface SlotCapacity {
  manufacturing: number;
  science: number;
  reactions: number;
}

export function slotCapacity(levels: Record<string, number> | null): SlotCapacity {
  const slots = (category: JobCategory) =>
    SLOT_SKILLS[category].reduce((total, skill) => total + (levels?.[String(skill.id)] ?? 0), 1);
  return {
    manufacturing: slots('manufacturing'),
    science: slots('science'),
    reactions: slots('reactions'),
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
  failed: boolean;
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
  if (args.loading || args.failed || characters.length === 0) return null;
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
