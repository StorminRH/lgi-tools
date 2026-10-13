import {
  systemIdentityReadout,
  type SystemIdentityReadout,
} from '@/data/eve-data/system-identity';
import type { SystemInfoLookup } from '@/data/eve-data/universe-assets-client';
import { resolveSystemLabel } from '../chain/labels';

export function destinationReadout(
  toSystemId: number | null,
  systemInfo: SystemInfoLookup | null,
): SystemIdentityReadout | null {
  if (toSystemId === null) return null;
  const label = resolveSystemLabel(toSystemId, systemInfo);
  return systemIdentityReadout({
    name: label.name,
    security: label.security ?? null,
    whClassId: label.whClassId ?? null,
  });
}
