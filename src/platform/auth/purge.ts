import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { EVE_PROVIDER_ID } from './eve-sso';
import { account, characters, corpAccessAudit, session } from '@/db/auth-schema';

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
