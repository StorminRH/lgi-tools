// Auth slice purge contributor (ACCOUNT.1) — the credential tier. Tears down a
// character's EVE link + encrypted tokens (the `account` row) and resets the
// owner-authored fields on the shared `characters` row (kept, not deleted — it's a
// telemetry FK target). These are steps 1–2 of the owner-hash transfer-purge
// surface, owned here so account-purge and owner-transfer compose the teardown
// through the registry rather than hard-coding its tables.
//
// Claims also cover `session` (torn down by the user-row cascade in the identity
// reconcile / a full account-nuke — sessions are per-user, not per-character) so
// the gate sees a home for it. `corp_access_audit` is the declared-retained
// exemption: the FK-less authz trail (3.7.3.3) outlives the user it records and
// ages out only through its separate 400-day retention policy.
//
// The account delete mirrors deleteLinkedCharacter's route-side teardown, while
// the registry boundary keeps table ownership separate from auth orchestration.
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { EVE_PROVIDER_ID } from './eve-sso';
import { account, characters, corpAccessAudit, session } from '@/db/auth-schema';

/**
 * Personal-data purge contributor for auth purge contributor; this data slice owns deleting its
 * user and character keyed rows.
 */
export const authPurgeContributor: PurgeContributor = {
  name: 'auth',
  tier: 'credential',
  claims: [account, session, characters],
  retained: [
    {
      table: corpAccessAudit,
      reason:
        'FK-less corp-access authz trail (3.7.3.3) — denials/decisions outlive the user or character they record, so personal-data teardown retains them; the separate 400-day retention policy ages them out.',
    },
  ],
  async purgeCharacter({ userId, characterId }) {
    await db
      .delete(account)
      .where(
        and(
          eq(account.providerId, EVE_PROVIDER_ID),
          eq(account.userId, userId),
          eq(account.accountId, String(characterId)),
        ),
      );
    await db
      .update(characters)
      .set({ preferences: {}, updatedAt: new Date() })
      .where(eq(characters.characterId, characterId));
  },
};
