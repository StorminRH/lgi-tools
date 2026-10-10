import type { EveScope } from '@/config/eve-scopes';
import { scopeEligibility } from '@/lib/scope-eligibility';

/** The character asset read lives under `esi-assets`. */
export const ASSETS_SYNC_SCOPES = [
  'esi-assets.read_assets.v1',
] as const satisfies readonly EveScope[];

export const canSyncAssets = scopeEligibility(ASSETS_SYNC_SCOPES);
