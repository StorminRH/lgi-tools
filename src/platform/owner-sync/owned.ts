import { planRead } from './plan';
import type { EnumeratedOwner, OwnerKey, OwnerSyncDescriptor, PagedOwnerSyncState, ReadSession } from './types';
import type { EsiResponseHeaders } from '../esi/response-metadata';

export type PagedOwnerReadResult =
  | { kind: 'fresh'; items: unknown[]; etags: string[]; responseHeaders: EsiResponseHeaders }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

export interface OwnedDatasetPort<TRow, TSession extends ReadSession> {
  now(): Date;
  listCharacters(userId: string): Promise<EnumeratedOwner[]>;
  vendToken(characterId: number): Promise<string | null>;
  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;
  isDue(owner: OwnerKey): Promise<boolean>;
  openSession(): TSession;
  read(session: TSession, owner: OwnerKey, accessToken: string): Promise<PagedOwnerReadResult>;
  readSyncState(owner: OwnerKey): Promise<PagedOwnerSyncState | null>;
  save(
    owner: OwnerKey,
    rows: TRow[],
    etags: string[],
    source: { endpoint: string; items: unknown[]; responseHeaders: EsiResponseHeaders },
  ): Promise<void>;
  stampFresh(owner: OwnerKey): Promise<void>;
}

export interface OwnedDatasetSpec<TRow> {
  resource: string;
  eligibleCharacter(owner: EnumeratedOwner): boolean;
  eligibleCorp(owner: EnumeratedOwner): boolean;
  requiredRoles: readonly string[];
  parse(items: unknown[]): TRow[] | null;
}

export interface OwnedSave<TRow> {
  rows: TRow[];
  etags: string[];
  source: { endpoint: string; items: unknown[]; responseHeaders: EsiResponseHeaders };
}

/** The owner's ESI path for `resource`; the snapshot reader filters on the same string the sync writes. */
export function ownedResourcePath(resource: string, owner: OwnerKey): string {
  return owner.ownerType === 'character'
    ? `/characters/${owner.ownerId}/${resource}/`
    : `/corporations/${owner.ownerId}/${resource}/`;
}

export function makeOwnedDescriptor<TRow, TSession extends ReadSession>(
  port: OwnedDatasetPort<TRow, TSession>,
  spec: OwnedDatasetSpec<TRow>,
): OwnerSyncDescriptor<OwnerKey, PagedOwnerSyncState, OwnedSave<TRow>, TSession> {
  return {
    now: () => port.now(),
    enumerate: (userId) => port.listCharacters(userId),
    identityOf: (owner) => owner,
    vendToken: (characterId) => port.vendToken(characterId),
    isDue: (owner) => port.isDue(owner),
    openSession: () => port.openSession(),
    characterAxis: {
      eligible: (owner) => spec.eligibleCharacter(owner),
      ownerOf: (characterId) => ({ ownerType: 'character', ownerId: characterId }),
    },
    corpAxis: {
      eligible: (owner) => spec.eligibleCorp(owner),
      ownerOf: (_userId, corporationId) => ({ ownerType: 'corporation', ownerId: corporationId }),
      requiredRoles: spec.requiredRoles,
      readRoles: (characterId, accessToken) => port.readRoles(characterId, accessToken),
    },
    readState: (owner) => port.readSyncState(owner),
    fetchAndPlan: async (owner, accessToken, _state, session) => {
      const endpoint = ownedResourcePath(spec.resource, owner);
      const read = await port.read(session, owner, accessToken);
      return planRead(read, (fresh) => {
        const rows = spec.parse(fresh.items);
        return rows === null
          ? null
          : {
              rows,
              etags: fresh.etags,
              source: {
                endpoint,
                items: fresh.items,
                responseHeaders: fresh.responseHeaders,
              },
            };
      });
    },
    save: (owner, payload) => port.save(owner, payload.rows, payload.etags, payload.source),
    stampFresh: (owner) => port.stampFresh(owner),
  };
}
