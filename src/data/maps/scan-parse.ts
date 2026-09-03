export const SCANNED_KINDS = ['signature', 'anomaly'] as const;

export type ScannedKind = (typeof SCANNED_KINDS)[number];

export const SIG_GROUPS = [
  'Wormhole',
  'Combat Site',
  'Ore Site',
  'Gas Site',
  'Data Site',
  'Relic Site',
] as const;

export type SigGroup = (typeof SIG_GROUPS)[number];

export interface ScannedRow {
  readonly signatureId: string;
  readonly kind: ScannedKind;
  readonly group: SigGroup | null;
  readonly name: string | null;
  readonly signalPct: number | null;
}

export type ScanRejectReason =
  | 'column-count'
  | 'invalid-signature-id'
  | 'invalid-kind'
  | 'invalid-group'
  | 'invalid-signal'
  | 'no-scanner-rows';

export interface RejectedLine {
  readonly lineNumber: number;
  readonly raw: string;
  readonly reason: ScanRejectReason;
}

export interface ScannerPasteResult {
  readonly rows: ScannedRow[];
  readonly rejects: RejectedLine[];
}

const GROUPS = new Set<SigGroup>(SIG_GROUPS);

const KINDS: Readonly<Record<string, ScannedKind>> = {
  'Cosmic Signature': 'signature',
  'Cosmic Anomaly': 'anomaly',
};

const SIGNATURE_ID = /^[A-Z]{3}-\d{3}$/;
const SIGNAL_PERCENT = /^(?:100(?:\.0+)?|\d{1,2}(?:\.\d+)?)%$/;

export function isScannerSignatureId(value: string): boolean {
  return SIGNATURE_ID.test(value);
}

const KIND_LABEL_PATTERN = new RegExp(
  `(?:${Object.keys(KINDS).join('|')})`,
);
const LEADING_SIGNATURE_ID_PATTERN = new RegExp(
  `(?:^|\\n)${SIGNATURE_ID.source.slice(1, -1)}\\t`,
);

export function isScannerPasteCandidate(text: string): boolean {
  return KIND_LABEL_PATTERN.test(text) || LEADING_SIGNATURE_ID_PATTERN.test(text);
}

function reject(lineNumber: number, raw: string, reason: ScanRejectReason): RejectedLine {
  return { lineNumber, raw, reason };
}

function parseGroup(value: string): SigGroup | null | undefined {
  if (value === '') return null;
  return GROUPS.has(value as SigGroup) ? (value as SigGroup) : undefined;
}

function parseSignal(value: string): number | null | undefined {
  if (value === '') return null;
  if (!SIGNAL_PERCENT.test(value)) return undefined;
  const signalPct = Number(value.slice(0, -1));
  return Number.isFinite(signalPct) && signalPct >= 0 && signalPct <= 100
    ? signalPct
    : undefined;
}

type ParsedScannerLine =
  | { readonly row: ScannedRow }
  | { readonly rejection: RejectedLine };

function parseScannerLine(raw: string, lineNumber: number): ParsedScannerLine {
  const columns = raw.split('\t');
  if (columns.length !== 6) {
    return { rejection: reject(lineNumber, raw, 'column-count') };
  }

  const [
    signatureValue = '',
    kindValue = '',
    groupValue = '',
    nameValue = '',
    signalValue = '',
  ] = columns.map((value) => value.trim());
  if (!isScannerSignatureId(signatureValue)) {
    return { rejection: reject(lineNumber, raw, 'invalid-signature-id') };
  }

  const kind = KINDS[kindValue];
  if (kind === undefined) {
    return { rejection: reject(lineNumber, raw, 'invalid-kind') };
  }

  const group = parseGroup(groupValue);
  if (group === undefined) {
    return { rejection: reject(lineNumber, raw, 'invalid-group') };
  }

  const signalPct = parseSignal(signalValue);
  if (signalPct === undefined) {
    return { rejection: reject(lineNumber, raw, 'invalid-signal') };
  }

  return {
    row: {
      signatureId: signatureValue,
      kind,
      group,
      name: nameValue === '' ? null : nameValue,
      signalPct,
    },
  };
}

export function parseScannerPaste(text: string): ScannerPasteResult {
  const rows: ScannedRow[] = [];
  const rejects: RejectedLine[] = [];

  for (const [index, sourceLine] of text.split(/\r?\n/).entries()) {
    const raw = sourceLine;
    if (raw.trim() === '') continue;
    const parsed = parseScannerLine(raw, index + 1);
    if ('row' in parsed) rows.push(parsed.row);
    else rejects.push(parsed.rejection);
  }

  if (rows.length === 0 && rejects.length === 0) {
    rejects.push(reject(0, '', 'no-scanner-rows'));
  }

  return { rows, rejects };
}
