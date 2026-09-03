import {
  systemIdentityReadout,
  type SystemIdentityReadout,
} from '@/data/eve-data/system-identity';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';
import { resolveSystemLabel } from '../chain/labels';

export function destinationReadout(
  toSystemId: number | null,
  systemInfo: ((id: number) => SystemDirectoryEntry | null) | null,
): SystemIdentityReadout | null {
  if (toSystemId === null) return null;
  const label = resolveSystemLabel(toSystemId, systemInfo);
  return systemIdentityReadout({
    name: label.name,
    security: label.security ?? null,
    whClassId: label.whClassId ?? null,
  });
}
