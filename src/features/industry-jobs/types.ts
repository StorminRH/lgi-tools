import type { IndustryJob } from './esi-projection';

export interface CharacterJobsData {
  jobs: IndustryJob[];
}

export interface RefreshCharacter {
  characterId: number;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

export interface CharacterJobsSyncState {
  lastRefreshedAt: Date | null;
  jobsEtag: string | null;
}

export type JobsEsiRead =
  | { kind: 'fresh'; body: unknown; etag: string | null }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

export interface JobsPort {
  now(): Date;
  listCharacters(userId: string): Promise<RefreshCharacter[]>;
  vendToken(characterId: number): Promise<string | null>;
  readJobs(characterId: number, accessToken: string, heldEtag: string | null): Promise<JobsEsiRead>;
  readSyncState(characterId: number): Promise<CharacterJobsSyncState | null>;
  saveJobs(characterId: number, jobs: IndustryJob[], etag: string | null): Promise<void>;
  stampFresh(characterId: number): Promise<void>;
}

export interface RefreshCorpMember {
  characterId: number;
  corporationId: number | null;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

export interface CorpJobsSyncState {
  lastRefreshedAt: Date | null;
  jobsEtag: string | null;
  syncError: string | null;
}

/**
 * The injected I/O the corp refresh runs over: auth (member enumeration, token vend,
 * in-game roles read), the one authed ESI gate read per corp, and Neon storage. The
 * real implementations are wired in src/composition/sync/corp-industry-jobs-sync.ts. Reuses
 * JobsEsiRead (the corp board is the same single endpoint shape as the character one).
 */
export interface CorpJobsPort {
  now(): Date;
  listMembers(userId: string): Promise<RefreshCorpMember[]>;
  vendToken(characterId: number): Promise<string | null>;
  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;
  readJobs(corporationId: number, accessToken: string, heldEtag: string | null): Promise<JobsEsiRead>;
  readSyncState(userId: string, corporationId: number): Promise<CorpJobsSyncState | null>;
  saveJobs(userId: string, corporationId: number, jobs: IndustryJob[], etag: string | null): Promise<void>;
  saveNeedsRole(userId: string, corporationId: number): Promise<void>;
  stampFresh(userId: string, corporationId: number): Promise<void>;
}
