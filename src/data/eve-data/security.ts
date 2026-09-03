export const SECURITY_CLASSES = ['high', 'low', 'null', 'wormhole'] as const;
export type SecurityClass = (typeof SECURITY_CLASSES)[number];

export function systemSecurityClass(
  securityStatus: number | null,
  wormholeClassId: number | null,
): SecurityClass {
  if (wormholeClassId !== null && (wormholeClassId <= 6 || (wormholeClassId >= 12 && wormholeClassId <= 18))) {
    return 'wormhole';
  }
  if (securityStatus === null) return 'high';
  if (securityStatus >= 0.45) return 'high';
  if (securityStatus > 0.0) return 'low';
  return 'null';
}

export function roundSecurityStatus(securityStatus: number): number {
  if (securityStatus === 0) return 0;
  if (securityStatus > 0 && securityStatus < 0.05) return 0.1;
  return Math.round(securityStatus * 10) / 10;
}

export function securityStatusTextClass(
  securityStatus: number | null,
): string {
  if (securityStatus === null) return 'text-muted';
  const rounded = roundSecurityStatus(securityStatus);
  if (rounded >= 1.0) return 'text-sec-10';
  if (rounded >= 0.9) return 'text-sec-09';
  if (rounded >= 0.8) return 'text-sec-08';
  if (rounded >= 0.7) return 'text-sec-07';
  if (rounded >= 0.6) return 'text-sec-06';
  if (rounded >= 0.5) return 'text-sec-05';
  if (rounded >= 0.4) return 'text-sec-04';
  if (rounded >= 0.3) return 'text-sec-03';
  if (rounded >= 0.2) return 'text-sec-02';
  if (rounded >= 0.1) return 'text-sec-01';
  return 'text-sec-null';
}
