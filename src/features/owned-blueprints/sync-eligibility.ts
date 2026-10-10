import type { EveScope } from '@/config/eve-scopes';
import { scopeEligibility } from '@/lib/scope-eligibility';

const BLUEPRINTS_SYNC_SCOPES = [
  'esi-characters.read_blueprints.v1',
] as const satisfies readonly EveScope[];

export const canSyncBlueprints = scopeEligibility(BLUEPRINTS_SYNC_SCOPES);
