import type { EsiReadSession } from '@/data/esi-store/session';
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

export interface SkillsPort extends CharacterSyncBase<CharacterSkillSyncState, EsiReadSession> {
  readSkillQueue(session: EsiReadSession, characterId: number, accessToken: string): Promise<SingleOwnerRead>;
  readSkills(session: EsiReadSession, characterId: number, accessToken: string): Promise<SingleOwnerRead>;
  saveSkills(characterId: number, halves: SkillsSaveHalves): Promise<void>;
  /** Records a settled refusal (no role-holder, a token that is gone) as the owner's stored answer, until `expiresAt` or the route's spec cache time. */
  recordRefusal(characterId: number, expiresAt: number | null): Promise<void>;
}
