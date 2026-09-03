import type { ScannedKind, ScannedRow } from './scan-parse';

export interface SignatureLifecycleRow {
  readonly signatureId: string;
  readonly kind?: ScannedKind;
  readonly deathLatestAt?: number | null;
}

export function signatureKind(row: SignatureLifecycleRow): ScannedKind {
  return row.kind ?? 'signature';
}

export function findMissingSignatures<Row extends SignatureLifecycleRow>(
  existing: readonly Row[],
  incoming: readonly Pick<ScannedRow, 'signatureId' | 'kind'>[],
): Row[] {
  const representedKinds = new Set(incoming.map((row) => row.kind));
  const observedIds = new Set(incoming.map((row) => row.signatureId));
  return existing.filter(
    (row) => representedKinds.has(signatureKind(row)) && !observedIds.has(row.signatureId),
  );
}

export function isConfidentMissingRemoval(
  row: SignatureLifecycleRow,
  now: number,
): boolean {
  return typeof row.deathLatestAt === 'number'
    && Number.isFinite(row.deathLatestAt)
    && row.deathLatestAt <= now;
}
