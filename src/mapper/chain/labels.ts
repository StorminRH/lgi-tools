import { systemClassText } from '@/data/eve-data/system-identity';
import type { SystemInfoLookup } from '@/data/eve-data/universe-assets-client';
import type { WormholeEffect } from '@/data/eve-data/wormhole-contract';

export interface SystemLabel {
  readonly name: string;
  readonly className: string | null;
  readonly security?: number | null;
  readonly whClassId?: number | null;
  readonly effect?: WormholeEffect | null;
}

export function resolveSystemLabel(
  systemId: number,
  systemInfo: SystemInfoLookup | null,
): SystemLabel {
  const entry = systemInfo === null ? null : systemInfo(systemId);
  if (entry === null) {
    return {
      name: String(systemId),
      className: null,
      security: null,
      whClassId: null,
      effect: null,
    };
  }
  return {
    name: entry.name,
    className: systemClassText(entry.whClassId),
    security: entry.security,
    whClassId: entry.whClassId,
    effect: entry.effect,
  };
}
