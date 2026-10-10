import type { EveScope } from '@/config/eve-scopes';
import { scopeEligibility } from '@/lib/scope-eligibility';

/**
 * The roles read is shared with corp industry jobs; the corp-blueprints read
 * lives under `esi-corporations` (NOT `esi-characters` — unlike the roles read).
 */
export const CORP_BLUEPRINTS_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-corporations.read_blueprints.v1',
] as const satisfies readonly EveScope[];

export const CORP_BLUEPRINTS_REQUIRED_ROLES = ['Director'] as const;

export const canSyncCorpBlueprints = scopeEligibility(CORP_BLUEPRINTS_SYNC_SCOPES);
