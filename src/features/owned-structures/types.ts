import type { SecurityClass } from '@/data/eve-data/security';
import type { SharingState, StructuresAccess } from '@/platform/auth/corp-visibility';
import type { EsiReadSession } from '@/data/esi-store/session';
import type { CorpSyncBase, PagedOwnerReadResult, PagedOwnerSyncState } from '@/platform/owner-sync';
import type { ParsedCorpStructure } from './esi-projection';

export interface CorpStructureRow {
  structureId: number;
  typeId: number;
  systemId: number;
  securityClass: SecurityClass;
  name: string | null;
}

export interface CorpStructurePageStructure extends CorpStructureRow {
  rigTypeIds: number[];
  taxPct: number | null;
}

export interface CorpStructurePageView {
  corporationId: number;
  corporationName: string;
  structureAccess: StructuresAccess;
  canManageSharing: boolean;
  sharing: SharingState;
  structures: CorpStructurePageStructure[];
  lastRefreshedAt: number | null;
}

/** What the structures drawer and the corporation settings page are served: every member corp, and whether a refresh is under way. */
export interface CorpStructuresPageResult {
  corporations: CorpStructurePageView[];
  refreshing: boolean;
}

export interface CorpOwner {
  corporationId: number;
}

/**
 * The injected I/O the corp refresh runs over: the shared corp base (member
 * enumeration, token vend, in-game roles read), the one paged authed ESI gate read
 * per corp, and Neon storage. The real implementations are wired in
 * src/composition/sync/corp-structures-sync.ts.
 */
export interface CorpStructuresPort extends CorpSyncBase<EsiReadSession> {
  isDue(corporationId: number): Promise<boolean>;
  readStructures(session: EsiReadSession, corporationId: number, accessToken: string): Promise<PagedOwnerReadResult>;
  readSyncState(corporationId: number): Promise<PagedOwnerSyncState | null>;
  saveStructures(corporationId: number, rows: ParsedCorpStructure[], etags: string[]): Promise<void>;
  stampFresh(corporationId: number): Promise<void>;
  /** Records the syncing user's settled refusal (no role-holder among their characters) for the corporation, until `expiresAt` or the route's spec cache time. */
  recordRefusal(corporationId: number, expiresAt: number | null): Promise<void>;
}
