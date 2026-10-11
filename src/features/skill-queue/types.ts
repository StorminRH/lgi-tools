import type { CharacterSyncBase, SingleOwnerRead } from '@/platform/owner-sync';
import type { SkillQueueEntry } from './esi-projection';

export interface CharacterSkillData {
  entries: SkillQueueEntry[];
  totalSp: number;
  unallocatedSp?: number;
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
