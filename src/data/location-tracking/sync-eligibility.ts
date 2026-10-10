import type { EveScope } from '@/config/eve-scopes';

export const LOCATION_SYNC_SCOPES = [
  'esi-location.read_location.v1',
  'esi-location.read_ship_type.v1',
  'esi-location.read_online.v1',
] as const satisfies readonly EveScope[];
