import type { CharacterOwner } from '@/platform/owner-sync';
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

export type SkillsEsiRead =
  | { kind: 'fresh'; body: unknown; etag: string | null }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

export interface SkillsSaveHalves {
  queue?: { entries: SkillQueueEntry[]; etag: string | null };
  skills?: {
    totalSp: number;
    unallocatedSp?: number;
    levels: Record<string, number>;
    etag: string | null;
  };
}

export interface SkillsPort {
  now(): Date;
  listCharacters(userId: string): Promise<CharacterOwner[]>;
  vendToken(characterId: number): Promise<string | null>;
  readSkillQueue(characterId: number, accessToken: string, heldEtag: string | null): Promise<SkillsEsiRead>;
  readSkills(characterId: number, accessToken: string, heldEtag: string | null): Promise<SkillsEsiRead>;
  readSyncState(characterId: number): Promise<CharacterSkillSyncState | null>;
  saveSkills(characterId: number, halves: SkillsSaveHalves): Promise<void>;
  stampFresh(characterId: number): Promise<void>;
}
