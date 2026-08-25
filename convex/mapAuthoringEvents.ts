import type { MutationCtx } from './_generated/server';
import {
  MAP_EVENT_RETENTION_MS,
  type MapEventKind,
  type MapEventPayloadByKind,
} from '@/data/maps/chain-events';

export async function eventActor(ctx: MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  return typeof identity?.name === 'string' ? identity.name : 'unknown';
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
