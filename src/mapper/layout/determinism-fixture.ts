// Committed cross-process determinism pins for the shipped engine (contract DC-2, proof SC-2.2).

/**
 * FNV-1a position digests of the compass kernel's layout of each corpus chain under
 * `DEFAULT_LAYOUT_CONFIG`, generated in a separate process from the suites that assert against
 * them. If any engine change moves any node by any amount, the digest changes and the determinism
 * suite names the drifted chain — regenerate deliberately and account for the movement in the
 * change's record.
 *
 * Regenerated 2026-08-01 for the deterministic-math swap (session 4.0.3.1.2 step 1), and
 * 2026-08-02 for the operator's G-1 dial ratification (ring 300, separation 150, fan 3,
 * proportional, compass-8) baked into `DEFAULT_LAYOUT_CONFIG`.
 */
export const DETERMINISM_DIGESTS: Readonly<Record<string, string>> = {
  'seed11-n2': 'f00ce039103be003',
  'seed12-n5': 'a4c01ecced9e0222',
  'seed13-n8': 'd29edd5d3ad73e50',
  'seed21-n12': '93915d5a6ef539f1',
  'seed22-n18': '86ee695c7b8c6980',
  'seed23-n25': 'a03ab5dfb9a1b957',
  'seed31-n34': '8859bded1c553871',
  'seed32-n42': '38b5f944d2a71ce7',
  'seed33-n50': '4789572614354268',
  'seed41-n60': '195f5047b733e201',
  'seed42-n60': '92ba1197a6de0a31',
  'seed43-n60': '459b23bbd2b51ba0',
};
