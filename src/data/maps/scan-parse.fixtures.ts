import type { ScannedRow, ScannerPasteResult } from './scan-parse';

/** One operator-supplied raw paste and its exact normalized parser result. */
export interface ScannerPasteFixture {
  readonly name: string;
  readonly paste: string;
  readonly expected: ScannerPasteResult;
}

function unresolved(signatureId: string): ScannedRow {
  return { signatureId, kind: 'signature', group: null, name: null, signalPct: 0 };
}

/** Exact normalized expectations for the four operator-supplied raw paste blocks. */
export const SCANNER_PASTE_FIXTURES: readonly ScannerPasteFixture[] = [
  {
    name: 'full scan with signatures, anomalies, and unresolved rows',
    paste: `CBA-120\tCosmic Signature\tWormhole\t\t28.4%\t6.98 AU
LXX-844\tCosmic Signature\tWormhole\t\t58.6%\t9.87 AU
TFZ-437\tCosmic Anomaly\tOre Site\tOrdinary Perimeter Deposit\t100.0%\t4.80 AU
WGV-890\tCosmic Anomaly\tOre Site\tOrdinary Perimeter Deposit\t100.0%\t5.11 AU
MPR-090\tCosmic Anomaly\tOre Site\tOrdinary Perimeter Deposit\t100.0%\t6.41 AU
BXM-155\tCosmic Anomaly\tOre Site\tAverage Frontier Deposit\t100.0%\t4.28 AU
NTF-389\tCosmic Anomaly\tOre Site\tUnexceptional Frontier Deposit\t100.0%\t8.02 AU
DAN-497\tCosmic Anomaly\tOre Site\tUnusual Core Deposit\t100.0%\t6.06 AU
ZUV-807\tCosmic Anomaly\tOre Site\tUnexceptional Frontier Deposit\t100.0%\t10.49 AU
FRO-820\tCosmic Anomaly\tOre Site\tCommon Perimeter Deposit\t100.0%\t6.57 AU
IHJ-610\tCosmic Signature\tGas Site\tBarren Perimeter Reservoir\t100.0%\t7.69 AU
YOT-768\tCosmic Signature\tGas Site\tOrdinary Perimeter Reservoir\t100.0%\t6.20 AU
KUO-916\tCosmic Anomaly\tCombat Site\tFrontier Command Post\t100.0%\t10.03 AU
PRU-055\tCosmic Anomaly\tCombat Site\tFrontier Command Post\t100.0%\t5.22 AU
UPJ-590\tCosmic Anomaly\tCombat Site\tIntegrated Terminus\t100.0%\t7.66 AU
JCA-892\tCosmic Anomaly\tCombat Site\tIntegrated Terminus\t100.0%\t9.95 AU
VIB-206\tCosmic Anomaly\tCombat Site\tFrontier Command Post\t100.0%\t5.79 AU
WFG-088\tCosmic Anomaly\tCombat Site\tFrontier Barracks\t100.0%\t8.63 AU
EAR-696\tCosmic Signature\t\t\t0.0%\t4.22 AU
FLD-047\tCosmic Signature\t\t\t0.0%\t6.85 AU
XKW-981\tCosmic Signature\t\t\t0.0%\t12.34 AU
CNN-648\tCosmic Signature\t\t\t0.0%\t13.01 AU
UMI-744\tCosmic Signature\t\t\t0.0%\t13.04 AU`,
    expected: {
      rows: [
        { signatureId: 'CBA-120', kind: 'signature', group: 'Wormhole', name: null, signalPct: 28.4 },
        { signatureId: 'LXX-844', kind: 'signature', group: 'Wormhole', name: null, signalPct: 58.6 },
        { signatureId: 'TFZ-437', kind: 'anomaly', group: 'Ore Site', name: 'Ordinary Perimeter Deposit', signalPct: 100 },
        { signatureId: 'WGV-890', kind: 'anomaly', group: 'Ore Site', name: 'Ordinary Perimeter Deposit', signalPct: 100 },
        { signatureId: 'MPR-090', kind: 'anomaly', group: 'Ore Site', name: 'Ordinary Perimeter Deposit', signalPct: 100 },
        { signatureId: 'BXM-155', kind: 'anomaly', group: 'Ore Site', name: 'Average Frontier Deposit', signalPct: 100 },
        { signatureId: 'NTF-389', kind: 'anomaly', group: 'Ore Site', name: 'Unexceptional Frontier Deposit', signalPct: 100 },
        { signatureId: 'DAN-497', kind: 'anomaly', group: 'Ore Site', name: 'Unusual Core Deposit', signalPct: 100 },
        { signatureId: 'ZUV-807', kind: 'anomaly', group: 'Ore Site', name: 'Unexceptional Frontier Deposit', signalPct: 100 },
        { signatureId: 'FRO-820', kind: 'anomaly', group: 'Ore Site', name: 'Common Perimeter Deposit', signalPct: 100 },
        { signatureId: 'IHJ-610', kind: 'signature', group: 'Gas Site', name: 'Barren Perimeter Reservoir', signalPct: 100 },
        { signatureId: 'YOT-768', kind: 'signature', group: 'Gas Site', name: 'Ordinary Perimeter Reservoir', signalPct: 100 },
        { signatureId: 'KUO-916', kind: 'anomaly', group: 'Combat Site', name: 'Frontier Command Post', signalPct: 100 },
        { signatureId: 'PRU-055', kind: 'anomaly', group: 'Combat Site', name: 'Frontier Command Post', signalPct: 100 },
        { signatureId: 'UPJ-590', kind: 'anomaly', group: 'Combat Site', name: 'Integrated Terminus', signalPct: 100 },
        { signatureId: 'JCA-892', kind: 'anomaly', group: 'Combat Site', name: 'Integrated Terminus', signalPct: 100 },
        { signatureId: 'VIB-206', kind: 'anomaly', group: 'Combat Site', name: 'Frontier Command Post', signalPct: 100 },
        { signatureId: 'WFG-088', kind: 'anomaly', group: 'Combat Site', name: 'Frontier Barracks', signalPct: 100 },
        unresolved('EAR-696'),
        unresolved('FLD-047'),
        unresolved('XKW-981'),
        unresolved('CNN-648'),
        unresolved('UMI-744'),
      ],
      rejects: [],
    },
  },
  {
    name: 'anomalies filtered in game',
    paste: `CBA-120\tCosmic Signature\tWormhole\tUnstable Wormhole\t100.0%\t7.03 AU
LXX-844\tCosmic Signature\tWormhole\tUnstable Wormhole\t100.0%\t9.85 AU
EAR-696\tCosmic Signature\tRelic Site\t\t49.1%\t3.59 AU
IHJ-610\tCosmic Signature\tGas Site\tBarren Perimeter Reservoir\t100.0%\t7.69 AU
YOT-768\tCosmic Signature\tGas Site\tOrdinary Perimeter Reservoir\t100.0%\t6.20 AU
FLD-047\tCosmic Signature\t\t\t0.0%\t4.85 AU
XKW-981\tCosmic Signature\t\t\t0.0%\t12.34 AU
CNN-648\tCosmic Signature\t\t\t0.0%\t13.01 AU
UMI-744\tCosmic Signature\t\t\t0.0%\t13.04 AU`,
    expected: {
      rows: [
        { signatureId: 'CBA-120', kind: 'signature', group: 'Wormhole', name: 'Unstable Wormhole', signalPct: 100 },
        { signatureId: 'LXX-844', kind: 'signature', group: 'Wormhole', name: 'Unstable Wormhole', signalPct: 100 },
        { signatureId: 'EAR-696', kind: 'signature', group: 'Relic Site', name: null, signalPct: 49.1 },
        { signatureId: 'IHJ-610', kind: 'signature', group: 'Gas Site', name: 'Barren Perimeter Reservoir', signalPct: 100 },
        { signatureId: 'YOT-768', kind: 'signature', group: 'Gas Site', name: 'Ordinary Perimeter Reservoir', signalPct: 100 },
        unresolved('FLD-047'),
        unresolved('XKW-981'),
        unresolved('CNN-648'),
        unresolved('UMI-744'),
      ],
      rejects: [],
    },
  },
  {
    name: 'same system scanned further with reordered rows and signal regression',
    paste: `FLD-047\tCosmic Signature\tWormhole\tUnstable Wormhole\t100.0%\t6.67 AU
CBA-120\tCosmic Signature\tWormhole\tUnstable Wormhole\t100.0%\t7.03 AU
XKW-981\tCosmic Signature\tWormhole\tUnstable Wormhole\t100.0%\t12.60 AU
LXX-844\tCosmic Signature\tWormhole\tUnstable Wormhole\t100.0%\t9.85 AU
CNN-648\tCosmic Signature\tWormhole\tUnstable Wormhole\t0.0%\t13.01 AU
UMI-744\tCosmic Signature\tWormhole\tUnstable Wormhole\t100.0%\t11.48 AU
EAR-696\tCosmic Signature\tRelic Site\tForgotten Frontier Evacuation Center\t100.0%\t3.61 AU
IHJ-610\tCosmic Signature\tGas Site\tBarren Perimeter Reservoir\t100.0%\t7.69 AU
YOT-768\tCosmic Signature\tGas Site\tOrdinary Perimeter Reservoir\t100.0%\t6.20 AU`,
    expected: {
      rows: [
        { signatureId: 'FLD-047', kind: 'signature', group: 'Wormhole', name: 'Unstable Wormhole', signalPct: 100 },
        { signatureId: 'CBA-120', kind: 'signature', group: 'Wormhole', name: 'Unstable Wormhole', signalPct: 100 },
        { signatureId: 'XKW-981', kind: 'signature', group: 'Wormhole', name: 'Unstable Wormhole', signalPct: 100 },
        { signatureId: 'LXX-844', kind: 'signature', group: 'Wormhole', name: 'Unstable Wormhole', signalPct: 100 },
        { signatureId: 'CNN-648', kind: 'signature', group: 'Wormhole', name: 'Unstable Wormhole', signalPct: 0 },
        { signatureId: 'UMI-744', kind: 'signature', group: 'Wormhole', name: 'Unstable Wormhole', signalPct: 100 },
        { signatureId: 'EAR-696', kind: 'signature', group: 'Relic Site', name: 'Forgotten Frontier Evacuation Center', signalPct: 100 },
        { signatureId: 'IHJ-610', kind: 'signature', group: 'Gas Site', name: 'Barren Perimeter Reservoir', signalPct: 100 },
        { signatureId: 'YOT-768', kind: 'signature', group: 'Gas Site', name: 'Ordinary Perimeter Reservoir', signalPct: 100 },
      ],
      rejects: [],
    },
  },
  {
    name: 'partial selection with a near-object km distance',
    paste: `FLD-047\tCosmic Signature\tWormhole\tUnstable Wormhole\t100.0%\t98 km
CBA-120\tCosmic Signature\tWormhole\tUnstable Wormhole\t100.0%\t8.73 AU
XKW-981\tCosmic Signature\tWormhole\tUnstable Wormhole\t100.0%\t10.14 AU
IHJ-610\tCosmic Signature\tGas Site\tBarren Perimeter Reservoir\t100.0%\t5.17 AU
YOT-768\tCosmic Signature\tGas Site\tOrdinary Perimeter Reservoir\t100.0%\t5.09 AU`,
    expected: {
      rows: [
        { signatureId: 'FLD-047', kind: 'signature', group: 'Wormhole', name: 'Unstable Wormhole', signalPct: 100 },
        { signatureId: 'CBA-120', kind: 'signature', group: 'Wormhole', name: 'Unstable Wormhole', signalPct: 100 },
        { signatureId: 'XKW-981', kind: 'signature', group: 'Wormhole', name: 'Unstable Wormhole', signalPct: 100 },
        { signatureId: 'IHJ-610', kind: 'signature', group: 'Gas Site', name: 'Barren Perimeter Reservoir', signalPct: 100 },
        { signatureId: 'YOT-768', kind: 'signature', group: 'Gas Site', name: 'Ordinary Perimeter Reservoir', signalPct: 100 },
      ],
      rejects: [],
    },
  },
];
