// Auth slice purge contributor (ACCOUNT.1) — the credential tier. Tears down a
// character's EVE link + encrypted tokens (the `account` row) and resets the
// owner-authored fields on the shared `characters` row (kept, not deleted — it's a
// telemetry FK target). These are steps 1–2 of the owner-hash transfer-purge
// surface, now owned here so the registry composes the teardown rather than
// queries.ts hard-coding it.
//
// Claims also cover `session` (torn down by the user-row cascade in the identity
// reconcile / a full account-nuke — sessions are per-user, not per-character) so
// the gate sees a home for it. `corp_access_audit` is the declared-retained
// exemption: the FK-less authz trail (3.7.3.3) must outlive the user it records.
//
// Implemented WITHOUT importing queries.ts — that would close a
// queries → orchestrator → register-all → purge → queries cycle. The account delete
// mirrors deleteLinkedCharacter's (the route-side teardown); unifying the two onto
// the registry is ACCOUNT.2 work.
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/purge/types';
import { EVE_PROVIDER_ID } from './eve-sso';
import { account, characters, corpAccessAudit, session } from './schema';

export const authPurgeContributor: PurgeContributor = {
  name: 'auth',
  tier: 'credential',
  claims: [account, session, characters],
  retained: [
    {
      table: corpAccessAudit,
      reason:
        'FK-less corp-access authz trail (3.7.3.3) — denials/decisions must outlive the user or character they record, so it is deliberately never purged.',
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
