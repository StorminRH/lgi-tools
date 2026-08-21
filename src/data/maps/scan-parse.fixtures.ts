import type { ScannedRow, ScannerPasteResult, SigGroup } from './scan-parse';

/** One operator-supplied raw paste and its exact normalized parser result. */
export interface ScannerPasteFixture {
  readonly name: string;
  readonly paste: string;
  readonly expected: ScannerPasteResult;
}

function unresolved(signatureId: string): ScannedRow {
  return { signatureId, kind: 'signature', group: null, name: null, signalPct: 0 };
}

function sig(
  signatureId: string,
  group: SigGroup | null,
  name: string | null,
  signalPct: number,
): ScannedRow {
  return { signatureId, kind: 'signature', group, name, signalPct };
}

function anom(signatureId: string, group: SigGroup, name: string): ScannedRow {
  return { signatureId, kind: 'anomaly', group, name, signalPct: 100 };
}

function wh(signatureId: string, signalPct: number): ScannedRow {
  return { signatureId, kind: 'signature', group: 'Wormhole', name: 'Unstable Wormhole', signalPct };
}

function gas(signatureId: string, name: string): ScannedRow {
  return { signatureId, kind: 'signature', group: 'Gas Site', name, signalPct: 100 };
}

const oreTfz = anom('TFZ-437', 'Ore Site', 'Ordinary Perimeter Deposit');
const oreWgv = anom('WGV-890', 'Ore Site', 'Ordinary Perimeter Deposit');
const oreMpr = anom('MPR-090', 'Ore Site', 'Ordinary Perimeter Deposit');
const oreBxm = anom('BXM-155', 'Ore Site', 'Average Frontier Deposit');
const oreNtf = anom('NTF-389', 'Ore Site', 'Unexceptional Frontier Deposit');
const oreDan = anom('DAN-497', 'Ore Site', 'Unusual Core Deposit');
const oreZuv = anom('ZUV-807', 'Ore Site', 'Unexceptional Frontier Deposit');
const oreFro = anom('FRO-820', 'Ore Site', 'Common Perimeter Deposit');
const combatKuo = anom('KUO-916', 'Combat Site', 'Frontier Command Post');
const combatPru = anom('PRU-055', 'Combat Site', 'Frontier Command Post');
const combatUpj = anom('UPJ-590', 'Combat Site', 'Integrated Terminus');
const combatJca = anom('JCA-892', 'Combat Site', 'Integrated Terminus');
const combatVib = anom('VIB-206', 'Combat Site', 'Frontier Command Post');
const combatWfg = anom('WFG-088', 'Combat Site', 'Frontier Barracks');
const whFld = wh('FLD-047', 100);
const whCba = wh('CBA-120', 100);
const whXkw = wh('XKW-981', 100);
const whLxx = wh('LXX-844', 100);
const whUmi = wh('UMI-744', 100);
const gasIhj = gas('IHJ-610', 'Barren Perimeter Reservoir');
const gasYot = gas('YOT-768', 'Ordinary Perimeter Reservoir');
const unresolvedEar = unresolved('EAR-696');
const unresolvedFld = unresolved('FLD-047');
const unresolvedXkw = unresolved('XKW-981');
const unresolvedCnn = unresolved('CNN-648');
const unresolvedUmi = unresolved('UMI-744');

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
        sig('CBA-120', 'Wormhole', null, 28.4),
        sig('LXX-844', 'Wormhole', null, 58.6),
        oreTfz,
        oreWgv,
        oreMpr,
        oreBxm,
        oreNtf,
        oreDan,
        oreZuv,
        oreFro,
        gasIhj,
        gasYot,
        combatKuo,
        combatPru,
        combatUpj,
        combatJca,
        combatVib,
        combatWfg,
        unresolvedEar,
        unresolvedFld,
        unresolvedXkw,
        unresolvedCnn,
        unresolvedUmi,
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
        whCba,
        whLxx,
        sig('EAR-696', 'Relic Site', null, 49.1),
        gasIhj,
        gasYot,
        unresolvedFld,
        unresolvedXkw,
        unresolvedCnn,
        unresolvedUmi,
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
        whFld,
        whCba,
        whXkw,
        whLxx,
        wh('CNN-648', 0),
        whUmi,
        sig('EAR-696', 'Relic Site', 'Forgotten Frontier Evacuation Center', 100),
        gasIhj,
        gasYot,
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
        whFld,
        whCba,
        whXkw,
        gasIhj,
        gasYot,
      ],
      rejects: [],
    },
  },
];
