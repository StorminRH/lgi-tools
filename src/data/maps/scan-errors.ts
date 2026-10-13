/**
 * The codes applyScan refuses a scanner paste with. The mapper keys its
 * failure toast on them, so the server and the client share one spelling.
 */
export const SCAN_REFUSAL_CODE = {
  offMap: 'OFF_MAP_SCAN_SYSTEM',
  untracked: 'UNTRACKED_SCAN_SYSTEM',
} as const;
