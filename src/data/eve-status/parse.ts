import { z } from 'zod';
import { EsiContractError } from '@/platform/esi';
import type { LiveServerStatus } from './types';

const statusBodySchema = z.object({
  players: z.number(),
  vip: z.boolean().optional(),
  server_version: z.string().optional(),
  start_time: z.string().optional(),
});

export function parseServerStatus(body: unknown): LiveServerStatus {
  const result = statusBodySchema.safeParse(body);
  if (!result.success) throw new EsiContractError();
  return {
    state: result.data.vip ? 'vip' : 'online',
    players: result.data.players,
    build: result.data.server_version ?? null,
    startedAt: result.data.start_time ?? null,
  };
}
