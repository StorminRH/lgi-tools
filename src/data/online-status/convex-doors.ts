import { z } from 'zod';
import { defineConvexDoor, purgeScopeRequestSchema } from '@/lib/convex-door-contract';

/**
 * Drops a user's online-status rows, or one character's. Convex answers with
 * its purge counts, which Next does not read. Convex bundles this module.
 */
export const purgeOnlineDoor = defineConvexDoor({
  path: '/purge-online',
  request: purgeScopeRequestSchema,
  response: z.unknown(),
});
