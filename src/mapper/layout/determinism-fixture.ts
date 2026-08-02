// Committed cross-process determinism pins for the shipped engine (contract DC-2, proof SC-2.2).

/**
 * FNV-1a position digests of the compass kernel's layout of each corpus chain under
 * `DEFAULT_LAYOUT_CONFIG`, generated in a separate process from the suites that assert against
 * them. If any engine change moves any node by any amount, the digest changes and the determinism
 * suite names the drifted chain — regenerate deliberately and account for the movement in the
 * change's record.
 */
export const DETERMINISM_DIGESTS: Readonly<Record<string, string>> = {
  'seed11-n2': 'e7043d390b0308dc',
  'seed12-n5': '6097cd9511721660',
  'seed13-n8': 'a0f5e40ce4f98524',
  'seed21-n12': 'e76101945e336f37',
  'seed22-n18': '60ccacf6a08f6066',
  'seed23-n25': '3f2b5831a5c31a89',
  'seed31-n34': '10eeddfa20416472',
  'seed32-n42': '863370c327896cdc',
  'seed33-n50': '3588f39549680d12',
  'seed41-n60': '60c8e037ace2735d',
  'seed42-n60': 'e55b48eb40761b96',
  'seed43-n60': 'f220b232d453afcb',
};
