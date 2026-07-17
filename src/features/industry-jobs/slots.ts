// Industry slot capacity + usage math for the /industry header readout
// (3.7.24). Per character, per activity, EVE grants 1 base job slot plus one
// per trained level of two skills — verified against the SDE (type_dogma
// attributes + the skills' own descriptions, "1 additional … job per level"),
// EveRef's dogma-attributes (450 manufacturingSlotBonus, 471
// laboratorySlotsBonus, 2661 reactionSlotBonus — each value 1), and EVE Uni
// (Research: base 1, max 11; Invention: Laboratory Operation / Advanced
// Laboratory Operation "govern how many concurrent science jobs" — research,
// copying, AND invention all draw from the science pool).
//
// USED counts a job against its INSTALLER — how the game charges slots — so a
// character's usage is their personal board plus any corp jobs they installed.
// Pure of React; the component is a shell over these functions.
import type { IndustryJob, JobStatus } from './esi-projection';
import { type JobCategory, jobCategory } from './industry-jobs-styles';

/** Manufacturing slots: 1 + Mass Production + Advanced Mass Production. */
export const MASS_PRODUCTION_SKILL_ID = 3387;
export const ADVANCED_MASS_PRODUCTION_SKILL_ID = 24625;
/**
 * Science slots (research/copy/invention): 1 + Laboratory Operation +
 * Advanced Laboratory Operation.
 */
export const LABORATORY_OPERATION_SKILL_ID = 3406;
export const ADVANCED_LABORATORY_OPERATION_SKILL_ID = 24624;
/** Reaction slots: 1 + Mass Reactions + Advanced Mass Reactions. */
export const MASS_REACTIONS_SKILL_ID = 45748;
export const ADVANCED_MASS_REACTIONS_SKILL_ID = 45749;

export const SLOT_CATEGORIES: readonly JobCategory[] = ['manufacturing', 'science', 'reactions'];

export interface SlotCapacity {
  manufacturing: number;
  science: number;
  reactions: number;
}

/**
 * A character with no synced skill levels (null — never synced, or pre-0039
 * row) fails OPEN to the base 1/1/1; a present map simply missing a skill key
 * legitimately means rank 0. Natural maximum is 11 per activity (1 + 5 + 5).
 */
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

/**
 * active | paused | ready hold their slot; delivered/cancelled/reverted free
 * it. Invariant under deriveJobStatus — it only maps active → ready, and both
 * occupy — so raw and derived statuses answer identically.
 */
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

/**
 * The header readout's view-model: null while any feed is still loading or
 * when no characters qualify (signed out / none linked — the readout renders
 * nothing, never errors); otherwise used/total per activity summed across the
 * characters whose jobs the gauge can actually see. The slots endpoint
 * returns every linked character, but the job boards don't: a character is in
 * the gauge when their PERSONAL board is readable (`eligibleCharacterIds`) OR
 * they installed a VISIBLE corp job (corp boards are corporation-scoped — one
 * eligible reader surfaces every member's jobs, so an installer can be
 * readable there while lacking the personal-jobs scope; dropping them would
 * leave the header counting fewer used slots than the corp section right
 * below it shows). Only a corp job still OCCUPYING a slot admits its
 * installer — a delivered/cancelled one frees the slot and counts nothing,
 * so it must not add its installer's capacity either. A character with
 * neither stays out — counting capacity with no visible jobs would
 * under-report usage. For a corp-only installer
 * the personal board stays unreadable, so their personal jobs (if any) still
 * can't be counted — visible-jobs coverage is the invariant, not
 * omniscience. Capacity comes from the slots endpoint (base 1/1/1 for a
 * character with no synced skills).
 */
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
