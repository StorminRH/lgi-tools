import { expireNow } from '@/lib/cache-expiry';
import { PURGE_CONTRIBUTORS } from './register-all';
import type {
  PurgeCharacterSubject,
  PurgeContributor,
  PurgeSubject,
  PurgeTier,
} from '@/platform/purge/types';

const TIER_ORDER: readonly PurgeTier[] = ['credential', 'cache', 'durable'];

/**
 * Expires the contributor's cache tags as soon as its own deletes resolve, so
 * a later contributor's failure still leaves these rows unserved. The tagged
 * contributors delete on the autocommit `db`, never the deletion job's
 * transaction, so their tags expire only after the deletes have committed.
 */
async function purgeCharacterFrom(
  contributor: PurgeContributor,
  subject: PurgeCharacterSubject,
): Promise<void> {
  await contributor.purgeCharacter?.(subject);
  for (const tag of contributor.cacheTags?.(subject) ?? []) expireNow(tag);
}

async function runTier(tier: PurgeTier, subject: PurgeSubject): Promise<void> {
  for (const contributor of PURGE_CONTRIBUTORS) {
    if (contributor.tier !== tier) continue;
    if (subject.kind === 'character') await purgeCharacterFrom(contributor, subject);
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
