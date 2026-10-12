import type { EsiHolder } from '@/lib/esi-datasets/types';
import type { ESI_RESPONSE_HOLDER_TYPES } from './schema';
import type { EsiParams, EsiStoreKey } from './types';

export type EsiResponseHolderType = (typeof ESI_RESPONSE_HOLDER_TYPES)[number];

/** The row columns that identify one stored answer. */
export interface RowIdentity {
  readonly route: string;
  readonly holderType: EsiResponseHolderType;
  readonly holderId: number;
  readonly userId: string;
  readonly params: string;
}

const PLACEHOLDER = /\{([a-z_]+)\}/g;

/** The holder's row columns: `user-corporation` is a corporation row with `user_id` set. */
export function holderColumns(holder: EsiHolder): Pick<RowIdentity, 'holderType' | 'holderId' | 'userId'> {
  switch (holder.kind) {
    case 'global':
      return { holderType: 'global', holderId: 0, userId: '' };
    case 'character':
    case 'corporation':
      return { holderType: holder.kind, holderId: holder.id, userId: '' };
    case 'user-corporation':
      return { holderType: 'corporation', holderId: holder.id, userId: holder.userId };
  }
}

function encodePair(name: string, value: string | number): string {
  return `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`;
}

/** Every parameter, path and query alike, as one sorted `name=value&…` string, so a key reads the same however it was spelled. */
export function canonicalParams(params: EsiParams | undefined): string {
  if (params === undefined) return '';
  return Object.keys(params)
    .sort()
    .map((name) => encodePair(name, params[name] as string | number))
    .join('&');
}

export function rowIdentity(key: EsiStoreKey): RowIdentity {
  return { route: key.route, ...holderColumns(key.holder), params: canonicalParams(key.params) };
}

/** One string per row identity: the map key for batched reads and the text the advisory-lock hash is taken over. */
export function identityText(identity: RowIdentity): string {
  return [identity.route, identity.holderType, identity.holderId, identity.userId, identity.params].join('|');
}

/** The placeholder values a holder supplies: its own id under the route's owner placeholder. */
function holderPlaceholders(holder: EsiHolder): Readonly<Record<string, number>> {
  switch (holder.kind) {
    case 'global':
      return {};
    case 'character':
      return { character_id: holder.id };
    case 'corporation':
    case 'user-corporation':
      return { corporation_id: holder.id };
  }
}

/**
 * The concrete ESI path for a key: the route's placeholders filled from the
 * holder, then from `params`, and every parameter left over appended as the
 * sorted query string. A placeholder nothing fills is a programming error.
 */
export function resolvePath(key: EsiStoreKey): string {
  const fromHolder = holderPlaceholders(key.holder);
  const params: Record<string, string | number> = { ...key.params };
  const path = key.route.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = fromHolder[name] ?? params[name];
    if (value === undefined) throw new Error(`ESI route ${key.route} is missing ${placeholder}`);
    delete params[name];
    return encodeURIComponent(String(value));
  });
  const query = canonicalParams(params);
  return query === '' ? path : `${path}?${query}`;
}
