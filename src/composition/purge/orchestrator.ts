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

export async function runPurge(
  subject: PurgeSubject,
  tiers: readonly PurgeTier[] = TIER_ORDER,
): Promise<void> {
  for (const tier of TIER_ORDER) {
    if (tiers.includes(tier)) await runTier(tier, subject);
  }
}
