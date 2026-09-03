import type { Doc } from '@/data/convex/data-model';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import {
  isScannerPasteCandidate,
  parseScannerPaste,
  type ScannedKind,
  type ScannedRow,
  type SigGroup,
} from '@/data/maps/scan-parse';
import { signatureKind } from '@/data/maps/signature-lifecycle';
import { isTombstoned } from '@/data/maps/chain-contract';
import { hallwayDoorTypes } from '@/data/maps/connection-hallway';
import {
  isCodexSizeLocked,
  lifetimeRowDisplay,
  lifetimeUpperBoundLabel,
} from '../authoring/connection-intelligence';
import type { ConnectionEditorDetail } from '../chain/connection-detail';
import type { TrackedSystemTarget } from '../tracking/tracked-system';

export interface SignatureWindowRow {
  readonly key: string;
  readonly systemId: number;
  readonly signatureId: string;
  readonly kind: ScannedKind;
  readonly group: SigGroup | null;
  readonly name: string | null;
  readonly signalPct: number | null;
  readonly firstSeenAt: number;
  readonly connection: ConnectionEditorDetail | null;
  readonly endpoint?: 'from' | 'to';
  readonly className: string | null;
}

export type ConnectionSignatureInput = ConnectionEditorDetail;

export interface SignatureCounts {
  readonly signatures: number;
  readonly anomalies: number;
}

export type ScannerPasteDecision =
  | { readonly kind: 'apply'; readonly systemId: number; readonly rows: readonly ScannedRow[] }
  | { readonly kind: 'reject'; readonly rejectCount: number }
  | { readonly kind: 'read-only' }
  | { readonly kind: 'untracked' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ambiguous' };

const EMPTY_COUNTS: SignatureCounts = { signatures: 0, anomalies: 0 };

function signatureDocumentRow(
  row: Doc<'mapSignatures'>,
): SignatureWindowRow {
  return {
    key: `signature:${row._id}`,
    systemId: row.systemId,
    signatureId: row.signatureId,
    kind: signatureKind(row),
    group: row.group as SigGroup | null,
    name: row.typeName ?? row.wormholeTypeCode,
    signalPct: row.signalPct ?? null,
    firstSeenAt: row._creationTime,
    connection: null,
    className: null,
  };
}

function localWormholeTypeCode(
  row: ConnectionSignatureInput,
  side: 'from' | 'to',
): string | null {
  return hallwayDoorTypes(row)[side];
}

function connectionSideRow(
  row: ConnectionSignatureInput,
  side: 'from' | 'to',
  classLabelOf: (code: string) => string | null,
): SignatureWindowRow | null {
  const signatureId = side === 'from' ? row.from.signatureId : row.to.signatureId;
  const systemId = side === 'from' ? row.fromSystemId : row.toSystemId;
  if (signatureId === null || systemId === null) return null;
  const name = localWormholeTypeCode(row, side);
  return {
    key: side === 'from' ? `connection:${row.connectionId}` : `connection:${row.connectionId}:to`,
    systemId,
    signatureId,
    kind: 'signature',
    group: 'Wormhole',
    name,
    signalPct: side === 'from' ? row.from.signalPct : null,
    firstSeenAt: row.firstSeenAt ?? row._creationTime,
    connection: row,
    className: name === null ? null : classLabelOf(name),
    endpoint: side,
  };
}

function connectionRowsForScanner(
  row: ConnectionSignatureInput,
  classLabelOf: (code: string) => string | null,
): readonly SignatureWindowRow[] {
  if (isTombstoned(row)) return [];
  return [
    connectionSideRow(row, 'from', classLabelOf),
    connectionSideRow(row, 'to', classLabelOf),
  ].filter((projected) => projected !== null);
}

export function buildSignatureRows(
  signatures: readonly Doc<'mapSignatures'>[],
  connections: readonly ConnectionSignatureInput[],
  classLabelOf: (code: string) => string | null = () => null,
): readonly SignatureWindowRow[] {
  const byIdentity = new Map<string, SignatureWindowRow>();
  for (const row of signatures) {
    const projected = signatureDocumentRow(row);
    byIdentity.set(`${projected.systemId}:${projected.signatureId}`, projected);
  }
  for (const row of connections) {
    for (const projected of connectionRowsForScanner(row, classLabelOf)) {
      byIdentity.set(`${projected.systemId}:${projected.signatureId}`, projected);
    }
  }
  return [...byIdentity.values()].toSorted(
    (left, right) =>
      left.systemId - right.systemId ||
      left.signatureId.localeCompare(right.signatureId),
  );
}

const SCANNER_SECTION_ORDER = [
  'unknown',
  'wormholes',
  'combat',
  'harvestables',
  'hacking',
] as const;

export type ScannerSectionId = (typeof SCANNER_SECTION_ORDER)[number];

const SCANNER_SECTION_TITLES: Readonly<Record<ScannerSectionId, string>> = {
  unknown: 'Unknown',
  wormholes: 'Wormholes',
  combat: 'Combat',
  harvestables: 'Harvestables',
  hacking: 'Hacking',
};

export interface ScannerSection {
  readonly id: ScannerSectionId;
  readonly title: string;
  readonly rows: readonly SignatureWindowRow[];
}

const GROUP_TYPE_LABELS: Readonly<Record<SigGroup, string>> = {
  Wormhole: 'Wormhole',
  'Combat Site': 'Combat',
  'Gas Site': 'Gas',
  'Ore Site': 'Ore',
  'Data Site': 'Data',
  'Relic Site': 'Relic',
};

export function scannerGroupTypeLabel(group: SigGroup | null): string | null {
  return group === null ? null : (GROUP_TYPE_LABELS[group] ?? null);
}

export function scannerSectionForGroup(
  group: SigGroup | null,
): ScannerSectionId {
  switch (group) {
    case null:
      return 'unknown';
    case 'Wormhole':
      return 'wormholes';
    case 'Combat Site':
      return 'combat';
    case 'Gas Site':
    case 'Ore Site':
      return 'harvestables';
    case 'Data Site':
    case 'Relic Site':
      return 'hacking';
    default:
      return 'unknown';
  }
}

export function filterSignatureRows(
  rows: readonly SignatureWindowRow[],
  systemId: number | null,
  kind: ScannedKind,
): readonly SignatureWindowRow[] {
  if (systemId === null) return [];
  return rows.filter((row) => row.systemId === systemId && row.kind === kind);
}

export function groupSignatureSections(
  rows: readonly SignatureWindowRow[],
  systemId: number | null,
): readonly ScannerSection[] {
  if (systemId === null) return [];
  const buckets = new Map<ScannerSectionId, SignatureWindowRow[]>(
    SCANNER_SECTION_ORDER.map((id) => [id, []]),
  );
  for (const row of rows) {
    if (row.systemId !== systemId) continue;
    buckets.get(scannerSectionForGroup(row.group))!.push(row);
  }
  const sections: ScannerSection[] = [];
  for (const id of SCANNER_SECTION_ORDER) {
    const sectionRows = buckets.get(id) ?? [];
    if (sectionRows.length === 0) continue;
    sections.push({
      id,
      title: SCANNER_SECTION_TITLES[id],
      rows: sectionRows,
    });
  }
  return sections;
}

export function scannerWormholeSize(
  connection: Pick<ConnectionEditorDetail, 'shipSize'> | null,
  entry: WormholeCodexEntry | null,
): string {
  if (isCodexSizeLocked(entry) && entry !== null && entry.farSide === false) {
    return entry.sizeClass;
  }
  return connection?.shipSize ?? '—';
}

export function scannerWormholeLifetime(
  connection: Pick<ConnectionEditorDetail, '_creationTime' | 'lifetime'> | null,
  entry: WormholeCodexEntry | null,
  now: number,
): string {
  if (connection === null) return '—';
  const display = lifetimeRowDisplay(connection, entry, now);
  return display.kind === 'unset' ? '—' : display.label;
}

export function scannerLifeUpperBound(
  connection: Pick<ConnectionEditorDetail, '_creationTime' | 'lifetime'> | null,
  entry: WormholeCodexEntry | null,
  now: number,
): string {
  if (connection === null) return '—';
  return lifetimeUpperBoundLabel(connection, entry, now) ?? '—';
}

export function signatureCounts(
  rows: readonly SignatureWindowRow[],
  systemId: number | null,
): SignatureCounts {
  if (systemId === null) return EMPTY_COUNTS;
  let signatures = 0;
  let anomalies = 0;
  for (const row of rows) {
    if (row.systemId !== systemId) continue;
    if (row.kind === 'anomaly') anomalies += 1;
    else signatures += 1;
  }
  return { signatures, anomalies };
}

export function formatSignatureAge(firstSeenAt: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - firstSeenAt) / 60_000));
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined') return false;
  return target instanceof Element && target.matches(
    'input, textarea, [contenteditable="true"], [contenteditable="true"] *',
  );
}

export function scannerPasteDecision(
  text: string,
  canEdit: boolean,
  target: TrackedSystemTarget,
): ScannerPasteDecision | null {
  if (!isScannerPasteCandidate(text)) return null;
  const parsed = parseScannerPaste(text);
  if (parsed.rows.length === 0 || parsed.rejects.length > 0) {
    return { kind: 'reject', rejectCount: parsed.rejects.length };
  }
  if (!canEdit) return { kind: 'read-only' };
  if (target.kind === 'none') return { kind: 'untracked' };
  if (target.kind === 'loading') return { kind: 'loading' };
  if (target.kind === 'ambiguous') return { kind: 'ambiguous' };
  return { kind: 'apply', systemId: target.systemId, rows: parsed.rows };
}

export function scannerPasteRefusalToast(
  decision: Exclude<ScannerPasteDecision, { kind: 'apply' }>,
): { readonly message: string; readonly options: { readonly id: string; readonly duration?: number } } {
  if (decision.kind === 'reject') {
    const suffix = decision.rejectCount === 1 ? '' : 's';
    return {
      message: `Scanner paste rejected — ${decision.rejectCount} row${suffix} need attention.`,
      options: { id: 'scanner-paste:rejected', duration: 5_000 },
    };
  }
  if (decision.kind === 'read-only') {
    return {
      message: 'Edit access is required to apply scanner output.',
      options: { id: 'scanner-paste:read-only' },
    };
  }
  if (decision.kind === 'ambiguous') {
    return {
      message:
        'Tracked characters are in different systems — paste target is ambiguous.',
      options: { id: 'scanner-paste:ambiguous', duration: 5_000 },
    };
  }
  if (decision.kind === 'loading') {
    return {
      message: 'Location tracking is still loading — paste again in a moment.',
      options: { id: 'scanner-paste:loading', duration: 5_000 },
    };
  }
  return {
    message: 'Track an online character before pasting scanner output.',
    options: { id: 'scanner-paste:untracked' },
  };
}
