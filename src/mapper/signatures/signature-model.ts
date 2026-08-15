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
import { FAR_SIDE_WORMHOLE_CODE } from '@/data/eve-data/wormhole-contract';
import {
  isCodexSizeLocked,
  lifetimeRowDisplay,
  lifetimeUpperBoundLabel,
} from '../authoring/connection-intelligence';
import type { ConnectionEditorDetail } from '../chain/use-map-chain';
import type { TrackedSystemTarget } from '../tracking/tracked-system';

/** One signature-window row, independent of its Convex storage owner. */
export interface SignatureWindowRow {
  readonly key: string;
  readonly systemId: number;
  readonly signatureId: string;
  readonly kind: ScannedKind;
  readonly group: SigGroup | null;
  readonly name: string | null;
  readonly signalPct: number | null;
  readonly firstSeenAt: number;
  /** Shared editor row after a wormhole signature has migrated. */
  readonly connection: ConnectionEditorDetail | null;
  /** Destination class derived from the typed wormhole code. */
  readonly className: string | null;
}

/** Connection fields needed to keep migrated wormholes in the signature list. */
export type ConnectionSignatureInput = ConnectionEditorDetail;

/** Counts displayed in the tabs and System Info summary. */
export interface SignatureCounts {
  readonly signatures: number;
  readonly anomalies: number;
}

/** Result of classifying one page-level paste before any side effect runs. */
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
  if (row.wormholeTypeCode === null) return null;
  const typedSide = row.typedSide ?? 'from';
  if (side === typedSide) return row.wormholeTypeCode;
  return FAR_SIDE_WORMHOLE_CODE;
}

function connectionSideRow(
  row: ConnectionSignatureInput,
  side: 'from' | 'to',
  classLabelOf: (code: string) => string | null,
): SignatureWindowRow | null {
  const signatureId = side === 'from' ? row.fromSignatureId : row.toSignatureId;
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
    signalPct: side === 'from' ? row.fromSignalPct : null,
    firstSeenAt: row.firstSeenAt ?? row._creationTime,
    connection: row,
    className: name === null ? null : classLabelOf(name),
  };
}

function connectionRowsForScanner(
  row: ConnectionSignatureInput,
  classLabelOf: (code: string) => string | null,
): readonly SignatureWindowRow[] {
  if (row.deletedAt != null) return [];
  return [
    connectionSideRow(row, 'from', classLabelOf),
    connectionSideRow(row, 'to', classLabelOf),
  ].filter((projected) => projected !== null);
}

/**
 * Merges list-owned rows with migrated wormhole rows, preferring the durable
 * connection during a transient migration overlap. A linked hole appears on
 * both endpoint systems.
 */
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

/** Presentation buckets for the scanner (not stored SigGroup values). */
const SCANNER_SECTION_ORDER = [
  'unknown',
  'wormholes',
  'combat',
  'harvestables',
  'hacking',
] as const;

/** One scanner presentation section. */
export type ScannerSectionId = (typeof SCANNER_SECTION_ORDER)[number];

/** Visible section titles in scanner order. */
const SCANNER_SECTION_TITLES: Readonly<Record<ScannerSectionId, string>> = {
  unknown: 'Unknown',
  wormholes: 'Wormholes',
  combat: 'Combat',
  harvestables: 'Harvestables',
  hacking: 'Hacking',
};

/** One non-empty scanner section with its rows. */
export interface ScannerSection {
  readonly id: ScannerSectionId;
  readonly title: string;
  readonly rows: readonly SignatureWindowRow[];
}

/** Short Type-column labels for stored scanner groups. */
const GROUP_TYPE_LABELS: Readonly<Record<SigGroup, string>> = {
  Wormhole: 'Wormhole',
  'Combat Site': 'Combat',
  'Gas Site': 'Gas',
  'Ore Site': 'Ore',
  'Data Site': 'Data',
  'Relic Site': 'Relic',
};

/** Short Type-column label for one stored group, or null when unidentified. */
export function scannerGroupTypeLabel(group: SigGroup | null): string | null {
  return group === null ? null : GROUP_TYPE_LABELS[group];
}

/** Maps a stored signature group onto a scanner section. */
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
      // Schema-legal but non-vocabulary strings (legacy lowercase fixtures)
      // render as unidentified rather than crashing the section bucketing.
      return 'unknown';
  }
}

/** Rows for one system and tab, in stable scanner-ID order. */
export function filterSignatureRows(
  rows: readonly SignatureWindowRow[],
  systemId: number | null,
  kind: ScannedKind,
): readonly SignatureWindowRow[] {
  if (systemId === null) return [];
  return rows.filter((row) => row.systemId === systemId && row.kind === kind);
}

/**
 * Buckets one system's scanner rows into non-empty presentation sections
 * (Unknown first). Anomalies share the Combat / Harvestables / Hacking
 * buckets with signatures of the same stored group.
 */
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

/**
 * Scanner Size cell: typed non-K162 codex size class, else stored ship size,
 * else an honest placeholder.
 */
export function scannerWormholeSize(
  connection: Pick<ConnectionEditorDetail, 'shipSize'> | null,
  entry: WormholeCodexEntry | null,
): string {
  if (isCodexSizeLocked(entry) && entry !== null && entry.farSide === false) {
    return entry.sizeClass;
  }
  return connection?.shipSize ?? '—';
}

/**
 * Scanner Lifetime cell: same remaining-lifetime readout as the connection
 * editor (death-window range, typed SDE ceiling, or unset).
 */
export function scannerWormholeLifetime(
  connection: Pick<
    ConnectionEditorDetail,
    '_creationTime' | 'deathEarliestAt' | 'deathLatestAt' | 'lifeStage'
  > | null,
  entry: WormholeCodexEntry | null,
  now: number,
): string {
  if (connection === null) return '—';
  const display = lifetimeRowDisplay(connection, entry, now);
  return display.kind === 'unset' ? '—' : display.label;
}

/** Scanner Life cell: remaining-life upper bound, or an honest placeholder. */
export function scannerLifeUpperBound(
  connection: Pick<
    ConnectionEditorDetail,
    '_creationTime' | 'deathEarliestAt' | 'deathLatestAt' | 'lifeStage'
  > | null,
  entry: WormholeCodexEntry | null,
  now: number,
): string {
  if (connection === null) return '—';
  return lifetimeUpperBoundLabel(connection, entry, now) ?? '—';
}

/** Counts one system's signatures and anomalies. */
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

/** Human-readable age from one shared client clock. */
export function formatSignatureAge(firstSeenAt: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - firstSeenAt) / 60_000));
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Whether a document paste target owns normal text insertion. */
export function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined') return false;
  return target instanceof Element && target.matches(
    'input, textarea, [contenteditable="true"], [contenteditable="true"] *',
  );
}

/** Classifies scanner-shaped clipboard text without applying or reporting it.
 * Window routing (`persistentWindowSystemId`) is a separate consumer of the
 * same tracked-system target.
 */
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

/** Toast copy for a non-apply scanner paste decision. */
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
