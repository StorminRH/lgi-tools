import type { MutationCtx } from './_generated/server';
import {
  MAP_EVENT_RETENTION_MS,
  type MapEventKind,
  type MapEventPayloadByKind,
} from '@/data/maps/chain-events';

function accountName(identity: { name?: string } | null): string {
  return typeof identity?.name === 'string' ? identity.name : 'unknown';
}

/**
 * Names the caller on a map edit. On a character-scoped map that is one of
 * their characters eligible there: the earliest one still tracked on the map,
 * else the first by eligibility. A legacy claim signs with the account name.
 */
export async function eventActor(ctx: MutationCtx, mapId: string): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return accountName(identity);
  const claim = await ctx.db
    .query('mapAccess')
    .withIndex('by_map_user', (q) => q.eq('mapId', mapId).eq('userId', identity.subject))
    .unique();
  const characters = claim?.characters ?? [];
  const [first] = characters;
  if (first === undefined) return accountName(identity);
  const eligible = new Map(characters.map((character) => [character.characterId, character.name]));
  const tracked = await ctx.db
    .query('mapTracking')
    .withIndex('by_map_user', (q) => q.eq('mapId', mapId).eq('userId', identity.subject))
    .collect();
  return tracked.map((row) => eligible.get(row.characterId)).find((name) => name !== undefined)
    ?? first.name;
}

export async function writeMapEvent<Kind extends MapEventKind>(
  ctx: MutationCtx,
  input: {
    readonly mapId: string;
    readonly at: number;
    readonly kind: Kind;
    readonly actor: string;
    readonly payload: MapEventPayloadByKind[Kind];
  },
): Promise<void> {
  const payload = 'signatureIds' in input.payload
    ? {
        systemId: input.payload.systemId,
        signatureIds: [...input.payload.signatureIds],
      }
    : 'systemIds' in input.payload
      ? {
          connectionId: input.payload.connectionId,
          systemIds: [...input.payload.systemIds],
        }
      : { connectionId: input.payload.connectionId };
  await ctx.db.insert('mapEvents', {
    mapId: input.mapId,
    at: input.at,
    kind: input.kind,
    actor: input.actor,
    payload,
    purgeAfter: input.at + MAP_EVENT_RETENTION_MS,
  });
}
