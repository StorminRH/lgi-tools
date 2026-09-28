import { CORP_STRUCTURES_REQUIRED_ROLES } from '@/features/owned-structures/corp-sync-eligibility';
import { type AppFailure, forbiddenFailure } from '@/lib/failure';
import { authorizeCorpMutation } from '@/platform/auth/corp-access';
import { selectCorpCredential } from '@/platform/owner-sync';
import { resolveUserCorpAccess } from './corp-access';
import { probeAndStoreRoles, vendTokenFor } from './sync/owner-sync-port';

type CorpRoleGateResult = { ok: true } | { ok: false; failure: AppFailure };

async function corpRoleGate(
  userId: string,
  corporationId: number,
  requiredRoles: readonly string[],
  missingRole: AppFailure,
): Promise<CorpRoleGateResult> {
  const access = await resolveUserCorpAccess(userId);
  const decision = await authorizeCorpMutation(access, corporationId);
  if (!decision.allowed) {
    return { ok: false, failure: forbiddenFailure('not_corp_member', 'Not a member of this corporation') };
  }
  const selection = await selectCorpCredential(
    access.characterIdsByCorporation[corporationId] ?? [],
    requiredRoles,
    {
      vendToken: vendTokenFor,
      readRoles: (characterId, accessToken) => probeAndStoreRoles(characterId, accessToken, corporationId),
    },
  );
  return selection.kind === 'sufficient' ? { ok: true } : { ok: false, failure: missingRole };
}

export function directorGate(userId: string, corporationId: number): Promise<{ ok: true } | { ok: false; failure: AppFailure }> {
  return corpRoleGate(userId, corporationId, ['Director'], forbiddenFailure('not_director', 'Requires the Director role'));
}

export function stationManagerGate(userId: string, corporationId: number): Promise<{ ok: true } | { ok: false; failure: AppFailure }> {
  return corpRoleGate(
    userId,
    corporationId,
    CORP_STRUCTURES_REQUIRED_ROLES,
    forbiddenFailure('not_station_manager', 'Requires the Station Manager or Director role'),
  );
}
