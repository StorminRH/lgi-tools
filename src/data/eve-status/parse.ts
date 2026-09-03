import { z } from 'zod';
import { EsiContractError } from '@/platform/esi';
import type { ServerStatus } from './types';

const statusBodySchema = z.object({
  players: z.number(),
  vip: z.boolean().optional(),
});

export function parseServerStatus(
  body: unknown,
): Extract<ServerStatus, { players: number }> {
  const result = statusBodySchema.safeParse(body);
  if (!result.success) throw new EsiContractError();
  return {
    state: result.data.vip ? 'vip' : 'online',
    players: result.data.players,
  };
}
