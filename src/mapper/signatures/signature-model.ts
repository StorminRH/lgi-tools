import type { Doc } from '@/data/convex/data-model';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import {
  parseScannerPaste,
  type ScannedKind,
  type ScannedRow,
  type SigGroup,
} from '@/data/maps/scan-parse';
import { signatureKind } from '@/data/maps/signature-lifecycle';
import {
  isCodexSizeLocked,
  lifetimeRowDisplay,
} from '../authoring/connection-intelligence';
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
  | { readonly kind: 'untracked' }
  | { readonly kind: 'ambiguous' };

/**
 * Account-level paste target from the caller's online tracked pilots.
 * `ambiguous` is the interim refusal when two+ online tracked pilots sit in
 * different systems (backlog: multi-system paste disambiguation).
 */
export type TrackedPasteTarget =
  | { readonly kind: 'ready'; readonly systemId: number }
  | { readonly kind: 'none' }
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

/** Presentation buckets for the Signatures tab (not stored SigGroup values). */
export const SCANNER_SECTION_ORDER = [
  'unknown',
  'wormholes',
  'combat',
  'harvestables',
  'hacking',
] as const;

/** One Signatures-tab presentation section. */
export type ScannerSectionId = (typeof SCANNER_SECTION_ORDER)[number];

/** Visible section titles in scanner order. */
export const SCANNER_SECTION_TITLES: Readonly<Record<ScannerSectionId, string>> = {
  unknown: 'Unknown',
  wormholes: 'Wormholes',
  combat: 'Combat',
  harvestables: 'Harvestables',
  hacking: 'Hacking',
};

/** One non-empty Signatures-tab section with its rows. */
export interface ScannerSection {
  readonly id: ScannerSectionId;
  readonly title: string;
  readonly rows: readonly SignatureWindowRow[];
}

/** Maps a stored signature group onto a Signatures-tab section. */
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
 * Buckets one system's Cosmic Signature rows into non-empty presentation
 * sections (Unknown first). Anomalies stay on their own tab.
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
    if (row.systemId !== systemId || row.kind !== 'signature') continue;
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

/**
 * Resolves the paste target from the account's online tracked pilots on this
 * map. Coverage (`feedFreshAt` non-null) is the online gate — last-known
 * location alone must not unlock paste for a logged-off alt. The scanner
 * window lists the chain root instead (see SignatureProvider).
 */
export function trackedPasteTarget(input: {
  readonly ownTrackedCharacterIds: readonly number[];
  readonly tracked: readonly {
    readonly userId: string;
    readonly characterId: number;
    readonly location: { readonly solarSystemId: number } | null;
  }[];
  /** Per-owner-character quantized feed freshness; null/missing = not covered. */
  readonly freshness: ReadonlyMap<string, ReadonlyMap<number, number | null>>;
}): TrackedPasteTarget {
  const own = new Set(input.ownTrackedCharacterIds);
  const systems = new Set<number>();
  for (const row of input.tracked) {
    if (!own.has(row.characterId) || row.location === null) continue;
    const feedFreshAt =
      input.freshness.get(row.userId)?.get(row.characterId) ?? null;
    if (feedFreshAt === null) continue;
    systems.add(row.location.solarSystemId);
  }
  if (systems.size === 0) return { kind: 'none' };
  if (systems.size > 1) return { kind: 'ambiguous' };
  const systemId = systems.values().next().value;
  if (systemId === undefined) return { kind: 'none' };
  return { kind: 'ready', systemId };
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
  target: TrackedPasteTarget,
): ScannerPasteDecision | null {
  if (!isScannerPasteCandidate(text)) return null;
  const parsed = parseScannerPaste(text);
  if (parsed.rows.length === 0 || parsed.rejects.length > 0) {
    return { kind: 'reject', rejectCount: parsed.rejects.length };
  }
  if (!canEdit) return { kind: 'read-only' };
  if (target.kind === 'none') return { kind: 'untracked' };
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
  return {
    message: 'Track an online character before pasting scanner output.',
    options: { id: 'scanner-paste:untracked' },
  };
}
