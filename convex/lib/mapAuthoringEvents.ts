import type { MutationCtx } from '../_generated/server';
import {
  MAP_EVENT_RETENTION_MS,
  type MapEventKind,
  type MapEventPayloadByKind,
} from '@/data/maps/chain-events';
import { requireMapAccess, type MapPrincipal } from './mapAccess';
import { readUserMapTracking } from './mapTrackingCapacity';

function accountName(identity: { name?: string } | null): string {
  return typeof identity?.name === 'string' ? identity.name : 'unknown';
}

/**
 * Names the authorized caller on a map edit. On a character-scoped map that is
 * one of their characters eligible there: the earliest one still tracked on the
 * map, else the first by eligibility. A legacy claim, or a scoped claim with no
 * eligible character, signs with the account name.
 */
async function eventActor(
  ctx: MutationCtx,
  mapId: string,
  principal: MapPrincipal,
): Promise<string> {
  const characters = principal.characters ?? [];
  const [first] = characters;
  if (first === undefined) return accountName(await ctx.auth.getUserIdentity());
  const eligible = new Map(characters.map((character) => [character.characterId, character.name]));
  const tracked = await readUserMapTracking(ctx, mapId, principal.userId);
  return tracked.map((row) => eligible.get(row.characterId)).find((name) => name !== undefined)
    ?? first.name;
}

/**
 * Gates one public map edit on the caller's edit claim, then runs it with the
 * actor its map events sign with and the principal that passed the gate.
 * Throws UNAUTHENTICATED or FORBIDDEN before `run` touches any chain table.
 */
export async function gatedAuthoringEdit<T>(
  ctx: MutationCtx,
  mapId: string,
  run: (actor: string, principal: MapPrincipal) => Promise<T>,
): Promise<T> {
  const principal = await requireMapAccess(ctx, mapId, 'edit');
  return run(await eventActor(ctx, mapId, principal), principal);
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
