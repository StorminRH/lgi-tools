import type { CharacterSyncBase, CorpSyncBase, SingleOwnerRead } from '@/platform/owner-sync';
import type { IndustryJob } from './esi-projection';

export interface CharacterJobsData {
  jobs: IndustryJob[];
}

export interface CharacterJobsSyncState {
  lastRefreshedAt: Date | null;
  jobsEtag: string | null;
}

export interface JobsPort extends CharacterSyncBase<CharacterJobsSyncState> {
  readJobs(characterId: number, accessToken: string, heldEtag: string | null): Promise<SingleOwnerRead>;
  saveJobs(characterId: number, jobs: IndustryJob[], etag: string | null): Promise<void>;
}

export interface CorpJobsSyncState {
  lastRefreshedAt: Date | null;
  jobsEtag: string | null;
  syncError: string | null;
}

/**
 * The injected I/O the corp refresh runs over: the shared corp base (member
 * enumeration, token vend, in-game roles read), the one authed ESI gate read per
 * corp, and Neon storage. The real implementations are wired in
 * src/composition/sync/corp-industry-jobs-sync.ts. The corp board read has the same
 * single-endpoint shape as the character one.
 */
export interface CorpJobsPort extends CorpSyncBase {
  readJobs(corporationId: number, accessToken: string, heldEtag: string | null): Promise<SingleOwnerRead>;
  readSyncState(userId: string, corporationId: number): Promise<CorpJobsSyncState | null>;
  saveJobs(userId: string, corporationId: number, jobs: IndustryJob[], etag: string | null): Promise<void>;
  saveNeedsRole(userId: string, corporationId: number): Promise<void>;
  stampFresh(userId: string, corporationId: number): Promise<void>;
}
