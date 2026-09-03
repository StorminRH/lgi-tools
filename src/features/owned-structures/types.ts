import type { SecurityClass } from '@/data/eve-data/security';
import type { ParsedCorpStructure } from './esi-projection';

export interface CorpStructureRow {
  structureId: number;
  typeId: number;
  systemId: number;
  securityClass: SecurityClass;
  name: string | null;
}

export interface CorpStructureSharingState {
  enabled: boolean;
  setBy: number | null;
  setAt: Date;
}

export interface CorpStructurePageStructure extends CorpStructureRow {
  rigTypeIds: number[];
  taxPct: number | null;
}

export interface CorpStructurePageView {
  corporationId: number;
  corporationName: string;
  isStationManager: boolean;
  sharingEnabled: boolean;
  structures: CorpStructurePageStructure[];
  lastRefreshedAt: number | null;
}

export interface CorpOwner {
  corporationId: number;
}

export interface RefreshCorpMember {
  characterId: number;
  corporationId: number | null;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

export interface CorpStructuresSyncState {
  lastRefreshedAt: Date | null;
  pageEtags: string[];
}

export type CorpStructuresReadResult =
  | { kind: 'fresh'; items: unknown[]; etags: string[] }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

/**
 * The injected I/O the corp refresh runs over: auth (member enumeration, token vend,
 * in-game roles read), the one paged authed ESI gate read per corp, and Neon storage.
 * The real implementations are wired in src/composition/sync/corp-structures-sync.ts.
 */
export interface CorpStructuresPort {
  now(): Date;

  isSharingEnabled(corporationId: number): Promise<boolean>;

  listMembers(userId: string): Promise<RefreshCorpMember[]>;

  vendToken(characterId: number): Promise<string | null>;

  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;

  readStructures(
    corporationId: number,
    accessToken: string,
    heldEtags: string[],
  ): Promise<CorpStructuresReadResult>;

  readSyncState(corporationId: number): Promise<CorpStructuresSyncState | null>;

  saveStructures(corporationId: number, rows: ParsedCorpStructure[], etags: string[]): Promise<void>;

  stampFresh(corporationId: number): Promise<void>;
}
