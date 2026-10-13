import type { EsiReadSession } from '@/data/esi-store/session';
import type { CharacterSyncBase, CorpSyncBase, OwnerWrite, SingleOwnerRead } from '@/platform/owner-sync';
import type { IndustryJob } from './esi-projection';

export interface CharacterJobsData {
  jobs: IndustryJob[];
}

export interface CharacterJobsSyncState {
  lastRefreshedAt: Date | null;
}

export interface JobsPort extends CharacterSyncBase<CharacterJobsSyncState, EsiReadSession> {
  readJobs(session: EsiReadSession, characterId: number, accessToken: string): Promise<SingleOwnerRead>;
  /** The jobs write, which the refresh's commit runs atomically with its answers. */
  saveJobs(characterId: number, jobs: IndustryJob[], etag: string | null): OwnerWrite;
  /** Records a settled refusal (no role-holder, a token that is gone) as the owner's stored answer, until `expiresAt` or the route's spec cache time. */
  recordRefusal(characterId: number, expiresAt: number | null): Promise<void>;
}

export interface CorpJobsSyncState {
  lastRefreshedAt: Date | null;
  syncError: string | null;
}

/**
 * The injected I/O the corp refresh runs over: the shared corp base (member
 * enumeration, token vend, in-game roles read), the one authed ESI gate read per
 * corp, and Neon storage. The real implementations are wired in
 * src/composition/sync/corp-industry-jobs-sync.ts. The corp board read has the same
 * single-endpoint shape as the character one.
 */
export interface CorpJobsPort extends CorpSyncBase<EsiReadSession> {
  isDue(userId: string, corporationId: number): Promise<boolean>;
  readJobs(session: EsiReadSession, userId: string, corporationId: number, accessToken: string): Promise<SingleOwnerRead>;
  readSyncState(userId: string, corporationId: number): Promise<CorpJobsSyncState | null>;
  /** The jobs write, which the refresh's commit runs atomically with its answers. */
  saveJobs(userId: string, corporationId: number, jobs: IndustryJob[], etag: string | null): OwnerWrite;
  saveNeedsRole(userId: string, corporationId: number): Promise<void>;
  stampFresh(userId: string, corporationId: number): Promise<void>;
  /** Records a settled refusal (no role-holder, a token that is gone) as the owner's stored answer, until `expiresAt` or the route's spec cache time. */
  recordRefusal(userId: string, corporationId: number, expiresAt: number | null): Promise<void>;
}
