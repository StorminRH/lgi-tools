// Boundary schema + projection for the character online-status read (MIGRATE.A).
// GET /characters/{id}/online — the tracker stores only the boolean; the body's
// last_login/last_logout/logins fields have no consumer. ESI is an external API,
// so its body is Zod-validated here before anything is written to Convex.
// Runtime-light by design — zod only — because the Convex action
// (convex/onlineStatusSync.ts) imports this module and runs on the default
// Convex runtime.
import { z } from 'zod';

// GET /characters/{id}/online — `online` is the only field the dot needs; the
// timestamps/login-count are stripped (zod objects drop unknown keys).
const onlineBodySchema = z.object({ online: z.boolean() });

/**
 * Returns null on a shape mismatch — the syncing action records a contract error
 * for that character rather than retrying (a shape change won't fix itself) or
 * crashing the whole run.
 */
export function parseOnlineBody(body: unknown): boolean | null {
  const parsed = onlineBodySchema.safeParse(body);
  return parsed.success ? parsed.data.online : null;
}
