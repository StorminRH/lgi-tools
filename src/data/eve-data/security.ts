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

const POSITIVE_SECURITY_BANDS = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
] as const;

export type SecurityBand = (typeof POSITIVE_SECURITY_BANDS)[number] | 'null';

export function securityBand(securityStatus: number): SecurityBand {
  const tenths = Math.min(Math.round(roundSecurityStatus(securityStatus) * 10), 10);
  return POSITIVE_SECURITY_BANDS[tenths - 1] ?? 'null';
}

const SECURITY_TEXT_CLASS: Readonly<Record<SecurityBand, string>> = {
  '10': 'text-sec-10',
  '09': 'text-sec-09',
  '08': 'text-sec-08',
  '07': 'text-sec-07',
  '06': 'text-sec-06',
  '05': 'text-sec-05',
  '04': 'text-sec-04',
  '03': 'text-sec-03',
  '02': 'text-sec-02',
  '01': 'text-sec-01',
  null: 'text-sec-null',
};

export function securityStatusTextClass(
  securityStatus: number | null,
): string {
  if (securityStatus === null) return 'text-muted';
  return SECURITY_TEXT_CLASS[securityBand(securityStatus)];
}
