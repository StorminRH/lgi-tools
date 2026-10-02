import type { MapPrincipals } from '@/data/maps/access';
import { mapBlockRefusal } from '@/data/maps/access';
import type { MapBlockRequest } from '@/data/maps/api-contract';
import type { PendingMapAccessChange } from '@/data/maps/authorization-sql';
import {
  blockAuthorizedMapCharacter,
  unblockAuthorizedMapCharacter,
} from '@/data/maps/blocks';

export type BlockCharacter = typeof blockAuthorizedMapCharacter;
export type UnblockCharacter = typeof unblockAuthorizedMapCharacter;

export interface MapBlockWriters {
  readonly blockCharacter?: BlockCharacter;
  readonly unblockCharacter?: UnblockCharacter;
}

export type MapBlockWriteResult =
  | { readonly ok: true; readonly pending: PendingMapAccessChange }
  | { readonly ok: false; readonly reason: 'forbidden' | 'block-self' | 'block-owner' };

/**
 * Writes one block or unblock. The answer for a character nobody on LGI.tools
 * holds is the same as for one somebody does.
 */
export async function writeMapBlock(
  userId: string,
  principals: MapPrincipals,
  input: MapBlockRequest,
  writers: MapBlockWriters = {},
): Promise<MapBlockWriteResult> {
  if (input.operation === 'unblock') {
    const unblock = writers.unblockCharacter ?? unblockAuthorizedMapCharacter;
    const pending = await unblock(userId, principals, input.mapId, input.characterId);
    return pending === null ? { ok: false, reason: 'forbidden' } : { ok: true, pending };
  }
  const block = writers.blockCharacter ?? blockAuthorizedMapCharacter;
  const attempt = await block(userId, principals, input.mapId, input.characterId);
  if (attempt === null) return { ok: false, reason: 'forbidden' };
  const refusal = mapBlockRefusal({ callerUserId: userId, ...attempt });
  if (refusal !== null) return { ok: false, reason: refusal === 'self' ? 'block-self' : 'block-owner' };
  return attempt.pending === null
    ? { ok: false, reason: 'forbidden' }
    : { ok: true, pending: attempt.pending };
}
