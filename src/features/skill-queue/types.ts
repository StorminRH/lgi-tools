import type { CharacterSyncBase, SingleOwnerRead } from '@/platform/owner-sync';
import type { SkillQueueEntry } from './esi-projection';

export interface CharacterSkillData {
  entries: SkillQueueEntry[];
  totalSp: number;
  unallocatedSp?: number;
}

/** One character_skills row: the queue and SP figures, plus the trained levels when they are stored. */
export interface CharacterSkillRow {
  data: CharacterSkillData;
  levels: Record<string, number> | null;
}

export interface CharacterSkillSyncState {
  lastRefreshedAt: Date | null;
  queueEtag: string | null;
  skillsEtag: string | null;
}

export interface SkillsSaveHalves {
  queue?: { entries: SkillQueueEntry[]; etag: string | null };
  skills?: {
    totalSp: number;
    unallocatedSp?: number;
    levels: Record<string, number>;
    etag: string | null;
  };
}

export interface SkillsPort extends CharacterSyncBase<CharacterSkillSyncState> {
  readSkillQueue(characterId: number, accessToken: string, heldEtag: string | null): Promise<SingleOwnerRead>;
  readSkills(characterId: number, accessToken: string, heldEtag: string | null): Promise<SingleOwnerRead>;
  saveSkills(characterId: number, halves: SkillsSaveHalves): Promise<void>;
}
