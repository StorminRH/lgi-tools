// Committed cross-process determinism pins for the shipped engine (contract DC-2, proof SC-2.2).

/**
 * FNV-1a position digests of the compass kernel's layout of each corpus chain under
 * `DEFAULT_LAYOUT_CONFIG`, generated in a separate process from the suites that assert against
 * them. If any engine change moves any node by any amount, the digest changes and the determinism
 * suite names the drifted chain — regenerate deliberately and account for the movement in the
 * change's record.
 *
 * Regenerated 2026-08-01 for the deterministic-math swap (session 4.0.3.1.2 step 1),
 * 2026-08-02 for the G-1 dial ratification (ring 300, separation 150, fan 3,
 * proportional, compass-8), 2026-08-14 for the operator's compass retune
 * (ring 150, separation 110, fan 1, fixed-slot, compass-8), and again
 * 2026-08-14 after the 25% node scale (ring 170, separation 120) baked into
 * `DEFAULT_LAYOUT_CONFIG`.
 */
export const DETERMINISM_DIGESTS: Readonly<Record<string, string>> = {
  'seed11-n2': '002a343919047aa6',
  'seed12-n5': '9b67ca8318d86a58',
  'seed13-n8': '7aa58716f68bb256',
  'seed21-n12': 'ed7f13758fd56e13',
  'seed22-n18': '859bd144e5657abb',
  'seed23-n25': '316348f0649ffbfb',
  'seed31-n34': 'faf99dc1bccfd224',
  'seed32-n42': '6ee852d6b27d4663',
  'seed33-n50': '26c775bc2f07cbec',
  'seed41-n60': '69b5fb02f32fb751',
  'seed42-n60': 'ed3e0e59de2573f0',
  'seed43-n60': 'b9abc9a7f5774401',
};
