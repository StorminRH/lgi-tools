import type { Doc } from '@/data/convex/data-model';
import {
  parseScannerPaste,
  type ScannedKind,
  type ScannedRow,
  type SigGroup,
} from '@/data/maps/scan-parse';
import { signatureKind } from '@/data/maps/signature-lifecycle';
import type { ConnectionEditorDetail } from '../chain/use-map-chain';

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
  | { readonly kind: 'untracked' };

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

function connectionRow(
  row: ConnectionSignatureInput,
  classLabelOf: (code: string) => string | null,
): SignatureWindowRow | null {
  if (row.fromSignatureId === null || row.deletedAt != null) return null;
  return {
    key: `connection:${row.connectionId}`,
    systemId: row.fromSystemId,
    signatureId: row.fromSignatureId,
    kind: 'signature',
    group: 'Wormhole',
    name: row.wormholeTypeCode,
    signalPct: row.fromSignalPct,
    firstSeenAt: row.firstSeenAt ?? row._creationTime,
    connection: row,
    className:
      row.wormholeTypeCode === null
        ? null
        : classLabelOf(row.wormholeTypeCode),
  };
}

/**
 * Merges list-owned rows with migrated wormhole rows, preferring the durable
 * connection during a transient migration overlap.
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
    const projected = connectionRow(row, classLabelOf);
    if (projected === null) continue;
    byIdentity.set(`${projected.systemId}:${projected.signatureId}`, projected);
  }
  return [...byIdentity.values()].toSorted(
    (left, right) =>
      left.systemId - right.systemId ||
      left.signatureId.localeCompare(right.signatureId),
  );
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

/** Resolves the active signed-in character's owned tracked location. */
export function trackedPasteSystem(input: {
  readonly characterId: number | null;
  readonly ownTrackedCharacterIds: readonly number[];
  readonly tracked: readonly {
    readonly characterId: number;
    readonly location: { readonly solarSystemId: number } | null;
  }[];
}): number | null {
  if (
    input.characterId === null ||
    !input.ownTrackedCharacterIds.includes(input.characterId)
  ) {
    return null;
  }
  return input.tracked.find(
    (row) => row.characterId === input.characterId && row.location !== null,
  )?.location?.solarSystemId ?? null;
}

/** Whether a document paste target owns normal text insertion. */
export function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined') return false;
  return target instanceof Element && target.matches(
    'input, textarea, [contenteditable="true"], [contenteditable="true"] *',
  );
}

/** Whether page-level paste capture may treat text as scanner-shaped. */
export function isScannerPasteCandidate(text: string): boolean {
  return (
    /(?:Cosmic Signature|Cosmic Anomaly)/.test(text) ||
    /(?:^|\n)[A-Z]{3}-\d{3}\t/.test(text)
  );
}

/** Classifies scanner-shaped clipboard text without applying or reporting it. */
export function scannerPasteDecision(
  text: string,
  canEdit: boolean,
  systemId: number | null,
): ScannerPasteDecision | null {
  if (!isScannerPasteCandidate(text)) return null;
  const parsed = parseScannerPaste(text);
  if (parsed.rows.length === 0 || parsed.rejects.length > 0) {
    return { kind: 'reject', rejectCount: parsed.rejects.length };
  }
  if (!canEdit) return { kind: 'read-only' };
  if (systemId === null) return { kind: 'untracked' };
  return { kind: 'apply', systemId, rows: parsed.rows };
}
