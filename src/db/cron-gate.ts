// The cron entry gate: bearer auth → advisory lock → busy-skip, composed once.
// A gate primitive, NOT a job merger — the busy-response shape, telemetry
// scope, and success response stay each cron's own via the callbacks, so
// wrapping two crons never entangles them. Consumers with extra stages compose
// the layers directly instead (refresh-sde runs its version gate BEFORE the
// lock; refresh-prices is deliberately lock-free and uses requireCronAuth
// alone). Lives in src/db (composition layer): it binds the shared
// direct-endpoint client to the lock scaffold, which lib must not import.
import { requireCronAuth } from '@/lib/cron';
import { directClient } from '@/db';
import {
  withAdvisoryLock,
  type ReservedConnection,
} from './advisory-lock';

/**
 * Authenticates and executes one cron callback under its advisory lock, translating lock
 * contention and failures into the standard cron response.
 */
export async function runCronJob(options: {
  req: Request;
  lockKey: number;
  onBusy: () => Promise<Response> | Response;
  work: (reserved: ReservedConnection) => Promise<Response>;
}): Promise<Response> {
  const denied = await requireCronAuth(options.req);
  if (denied) return denied;

  const outcome = await withAdvisoryLock(directClient, options.lockKey, options.work);
  if (outcome.busy) return await options.onBusy();
  return outcome.result;
}
