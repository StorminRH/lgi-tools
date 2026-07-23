import { z } from 'zod';
import { EsiContractError } from '@/platform/esi';
import type { ServerStatus } from './types';

// Boundary schema for GET /status/. ESI also sends server_version + start_time,
// but the nav consumes only the player count and the VIP flag, so z.object
// strips the rest. `vip` is present (true) only during the VIP-only window
// after downtime; absent → a normal online server.
const statusBodySchema = z.object({
  players: z.number(),
  vip: z.boolean().optional(),
});

/**
 * Pure parse of a 200 /status/ body into the online/vip shape. Throws
 * EsiContractError on a shape change — routed like any other ESI failure (a
 * malformed body is no more usable than a 5xx). Exported for direct unit
 * testing of the parse path.
 */
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
