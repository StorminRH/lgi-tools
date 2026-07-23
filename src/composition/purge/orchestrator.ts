// The purge orchestrator. Runs every registered contributor's teardown for a
// subject in tier order (credential → cache → durable): kill the EVE link first so
// nothing can ESI-fetch mid-purge, then the regenerable caches, then the durable
// app-authored data. Writes are sequential and best-effort on the transaction-free
// request-path neon-http client — the same accepted non-atomic trade-off as
// reassignCharacter; a purge is rare and low-rate.
import { PURGE_CONTRIBUTORS } from './register-all';
import type { PurgeSubject, PurgeTier } from '@/platform/purge/types';

const TIER_ORDER: readonly PurgeTier[] = ['credential', 'cache', 'durable'];

async function runTier(tier: PurgeTier, subject: PurgeSubject): Promise<void> {
  for (const contributor of PURGE_CONTRIBUTORS) {
    if (contributor.tier !== tier) continue;
    if (subject.kind === 'character') await contributor.purgeCharacter?.(subject);
    else await contributor.purgeUser?.(subject);
  }
}

/**
 * Run the purge for `subject`. `tiers` narrows the sweep: the owner-hash
 * transfer-purge passes ['credential'] (a transferred character keeps its identity,
 * so its regenerable caches re-sync under the new owner and must NOT be torn down);
 * a full character/account purge runs every tier.
 */
export async function runPurge(
  subject: PurgeSubject,
  tiers: readonly PurgeTier[] = TIER_ORDER,
): Promise<void> {
  for (const tier of TIER_ORDER) {
    if (tiers.includes(tier)) await runTier(tier, subject);
  }
}
