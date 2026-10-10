import type { EveScope } from '@/config/eve-scopes';
import { scopeEligibility } from '@/lib/scope-eligibility';

/**
 * The roles read is shared with corp industry jobs + corp blueprints; the
 * corp-assets read lives under `esi-assets` (NOT `esi-corporations` — unlike
 * the corp BLUEPRINTS read).
 */
export const CORP_ASSETS_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-assets.read_corporation_assets.v1',
] as const satisfies readonly EveScope[];

export const CORP_ASSETS_REQUIRED_ROLES = ['Director'] as const;

export const canSyncCorpAssets = scopeEligibility(CORP_ASSETS_SYNC_SCOPES);
