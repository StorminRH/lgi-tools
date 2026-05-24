import type { SiteType, WormholeClass } from './schema';

type SheetTabKind = 'combat' | 'resource';

export type SheetTab = {
  gid: string;
  label: string;
  kind: SheetTabKind;
  wormholeClass: WormholeClass | null;
  resourceKind?: 'gas' | 'ore';
};

export const SHEET_TABS: SheetTab[] = [
  { gid: '0',          label: 'Class 1',         kind: 'combat',   wormholeClass: 'C1' },
  { gid: '152271063',  label: 'Class 2',         kind: 'combat',   wormholeClass: 'C2' },
  { gid: '1157002677', label: 'Class 3',         kind: 'combat',   wormholeClass: 'C3' },
  { gid: '2012494173', label: 'Class 4',         kind: 'combat',   wormholeClass: 'C4' },
  { gid: '124062662',  label: 'Class 5',         kind: 'combat',   wormholeClass: 'C5' },
  { gid: '1314849064', label: 'Class 6',         kind: 'combat',   wormholeClass: 'C6' },
  { gid: '141191379',  label: 'Gas Signatures',  kind: 'resource', wormholeClass: null, resourceKind: 'gas' },
  { gid: '1259304327', label: 'Ore Signatures',  kind: 'resource', wormholeClass: null, resourceKind: 'ore' },
];

export function csvUrlFor(pubKey: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/e/${pubKey}/pub?gid=${gid}&single=true&output=csv`;
}

// Signature label (raw row-2 col-B from the Sheet) → site_type enum value.
export const SIGNATURE_TO_SITE_TYPE: Record<string, SiteType> = {
  Anomaly: 'combat',
  'Relic Signature': 'relic',
  'Data Signature': 'data',
  'Gas Signature': 'gas',
  'Ore Signature': 'ore',
};
